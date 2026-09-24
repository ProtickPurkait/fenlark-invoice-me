import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { logActivity, SYSTEM_ACTOR, type Actor } from "@/lib/activity";
import { addDays, addMonths, formatMonthYear } from "@/lib/dates";
import { db } from "@/lib/db";
import { clients, documents, recurringProfiles, type RecurringProfile } from "@/lib/db/schema";
import { issueDocument, linesToTemplate, saveDraft } from "@/lib/documents/service";
import type { RecurringFrequency, RecurringTemplate } from "@/lib/documents/types";
import { defaultDocumentEmail, sendDocumentEmail } from "@/lib/email/documents";
import { UserError } from "@/lib/errors";
import { fetchInrRate } from "@/lib/fx";
import { loadSettings } from "@/lib/settings";
import { dateString, optionalDate, requiredText } from "@/lib/validation/common";
import { documentSchema, type DocumentInputValues } from "@/lib/validation/document";

export const scheduleSchema = z
  .object({
    name: requiredText(120, "Name this schedule, e.g. “Monthly retainer”"),
    frequency: z.enum(["weekly", "monthly", "quarterly", "half_yearly", "yearly"]),
    startDate: dateString,
    endDate: optionalDate,
    maxOccurrences: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(1000)])
      .nullable()
      .optional()
      .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
    paymentTermsDays: z.coerce.number().int().min(0).max(365),
    autoIssue: z.boolean(),
    autoSend: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Ends before it starts" });
    if (v.autoSend && !v.autoIssue) ctx.addIssue({ code: "custom", path: ["autoSend"], message: "Invoices must be issued to be sent" });
  });

export type ScheduleInput = z.input<typeof scheduleSchema>;

export function advance(date: string, frequency: RecurringFrequency): string {
  switch (frequency) {
    case "weekly":
      return addDays(date, 7);
    case "monthly":
      return addMonths(date, 1);
    case "quarterly":
      return addMonths(date, 3);
    case "half_yearly":
      return addMonths(date, 6);
    case "yearly":
      return addMonths(date, 12);
  }
}

/** `{MONTH}` → "September 2026", `{YEAR}` → "2026" in text copied onto each invoice. */
export function fillPlaceholders(text: string, date: string): string {
  return text.replaceAll("{MONTH}", formatMonthYear(date)).replaceAll("{YEAR}", date.slice(0, 4));
}

export async function saveProfile(actor: Actor, id: string | null, input: { schedule: ScheduleInput; document: DocumentInputValues }): Promise<string> {
  const schedule = scheduleSchema.parse(input.schedule);
  const doc = documentSchema.parse({ ...input.document, type: "invoice", issueDate: schedule.startDate, dueDate: null, validUntil: null, relatedDocumentId: null, noteReason: null });
  const [client] = await db.select().from(clients).where(eq(clients.id, doc.clientId));
  if (!client) throw new UserError("Client not found", { clientId: "Not found" });

  const template: RecurringTemplate = {
    currency: doc.currency,
    exchangeRate: doc.currency === "INR" ? "1" : doc.exchangeRate,
    placeOfSupply: doc.placeOfSupply,
    exportTax: doc.exportTax,
    reverseCharge: doc.reverseCharge,
    reference: doc.reference,
    subject: doc.subject,
    notes: doc.notes,
    terms: doc.terms,
    lines: linesToTemplate(input.document.lines),
  };
  const base = {
    name: schedule.name,
    clientId: doc.clientId,
    frequency: schedule.frequency,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    maxOccurrences: schedule.maxOccurrences,
    paymentTermsDays: schedule.paymentTermsDays,
    autoIssue: schedule.autoIssue,
    autoSend: schedule.autoSend,
    template,
  };

  if (id) {
    const [existing] = await db.select().from(recurringProfiles).where(eq(recurringProfiles.id, id));
    if (!existing) throw new UserError("Recurring profile not found");
    // When editing, the date field is the next run; the original start date is kept once it has run.
    await db
      .update(recurringProfiles)
      .set({
        ...base,
        startDate: existing.occurrences === 0 ? schedule.startDate : existing.startDate,
        nextRunDate: existing.status === "ended" ? existing.nextRunDate : schedule.startDate,
      })
      .where(eq(recurringProfiles.id, id));
    await logActivity(actor, { entityType: "recurring", entityId: id, action: "update", summary: `Updated recurring profile “${schedule.name}”` });
    return id;
  }
  const [row] = await db
    .insert(recurringProfiles)
    .values({ ...base, nextRunDate: schedule.startDate, createdBy: actor.type === "user" ? actor.id : null })
    .returning({ id: recurringProfiles.id });
  await logActivity(actor, { entityType: "recurring", entityId: row.id, action: "create", summary: `Created recurring profile “${schedule.name}” for ${client.name}` });
  return row.id;
}

export async function setProfileStatus(actor: Actor, id: string, status: "active" | "paused"): Promise<void> {
  const [p] = await db.select().from(recurringProfiles).where(eq(recurringProfiles.id, id));
  if (!p) throw new UserError("Recurring profile not found");
  if (p.status === "ended") throw new UserError("This schedule has ended. Create a new one.");
  await db.update(recurringProfiles).set({ status }).where(eq(recurringProfiles.id, id));
  await logActivity(actor, { entityType: "recurring", entityId: id, action: status, summary: `${status === "paused" ? "Paused" : "Resumed"} recurring profile “${p.name}”` });
}

export async function deleteProfile(actor: Actor, id: string): Promise<void> {
  const [p] = await db.select().from(recurringProfiles).where(eq(recurringProfiles.id, id));
  if (!p) throw new UserError("Recurring profile not found");
  await db.delete(recurringProfiles).where(eq(recurringProfiles.id, id));
  await logActivity(actor, { entityType: "recurring", entityId: id, action: "delete", summary: `Deleted recurring profile “${p.name}”` });
}

export interface RunResult {
  profileId: string;
  name: string;
  documentId?: string;
  number?: string | null;
  sent?: boolean;
  error?: string;
}

/** Create one invoice per due profile, then move its next run past `today`. */
export async function runDueProfiles(today: string): Promise<RunResult[]> {
  const due = await db
    .select()
    .from(recurringProfiles)
    .where(and(eq(recurringProfiles.status, "active"), lte(recurringProfiles.nextRunDate, today)));
  const results: RunResult[] = [];
  for (const profile of due) {
    results.push(await runProfile(profile, today));
  }
  return results;
}

export async function runProfile(profile: RecurringProfile, today: string, actor: Actor = SYSTEM_ACTOR): Promise<RunResult> {
  const result: RunResult = { profileId: profile.id, name: profile.name };
  // Claim the run first so an overlapping cron invocation can't double-bill.
  let next = profile.nextRunDate ?? today;
  while (next <= today) next = advance(next, profile.frequency);
  const occurrences = profile.occurrences + 1;
  const ended = (profile.maxOccurrences !== null && occurrences >= profile.maxOccurrences) || (profile.endDate !== null && next > profile.endDate);
  const claimed = await db
    .update(recurringProfiles)
    .set({ nextRunDate: ended ? null : next, occurrences, status: ended ? "ended" : "active", lastRunAt: new Date() })
    .where(and(eq(recurringProfiles.id, profile.id), eq(recurringProfiles.occurrences, profile.occurrences)))
    .returning({ id: recurringProfiles.id });
  if (claimed.length === 0) return { ...result, error: "Already processed" };

  try {
    const t = profile.template;
    const documentId = await saveDraft(actor, null, {
      type: "invoice",
      clientId: profile.clientId,
      issueDate: today,
      dueDate: addDays(today, profile.paymentTermsDays),
      validUntil: null,
      currency: t.currency,
      exchangeRate: t.currency === "INR" ? "1" : await currentRate(t.currency, t.exchangeRate, today),
      placeOfSupply: t.placeOfSupply ?? "",
      exportTax: t.exportTax,
      reverseCharge: t.reverseCharge,
      reference: fillPlaceholders(t.reference, today),
      subject: fillPlaceholders(t.subject, today),
      notes: fillPlaceholders(t.notes, today),
      terms: t.terms,
      relatedDocumentId: null,
      noteReason: null,
      lines: t.lines.map((l) => ({ ...l, name: fillPlaceholders(l.name, today), description: fillPlaceholders(l.description, today) })),
    });
    await db.update(documents).set({ recurringProfileId: profile.id }).where(eq(documents.id, documentId));
    result.documentId = documentId;

    if (profile.autoIssue) {
      const issued = await issueDocument(actor, documentId);
      result.number = issued.number;
      if (profile.autoSend) {
        const [client] = await db.select().from(clients).where(eq(clients.id, profile.clientId));
        if (client?.email) {
          const settings = await loadSettings();
          const draft = defaultDocumentEmail(issued, client, settings);
          const sent = await sendDocumentEmail({ documentId, to: draft.to, cc: draft.cc, subject: draft.subject, message: draft.message, attachPdf: true, actor });
          result.sent = sent.status !== "failed";
        }
      }
    }
    await logActivity(actor, {
      entityType: "recurring",
      entityId: profile.id,
      action: "run",
      summary: `Recurring “${profile.name}” created ${result.number ? `invoice ${result.number}` : "a draft invoice"}${result.sent ? " and emailed it" : ""}`,
      data: { documentId },
    });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    await logActivity(actor, {
      entityType: "recurring",
      entityId: profile.id,
      action: "run_failed",
      summary: `Recurring “${profile.name}” failed: ${result.error}`,
    });
  }
  return result;
}

/** Today's reference rate for foreign-currency schedules, else the rate saved on the schedule. */
async function currentRate(currency: string, fallback: string, today: string): Promise<string> {
  try {
    return (await fetchInrRate(currency, today)).rate;
  } catch {
    return fallback;
  }
}
