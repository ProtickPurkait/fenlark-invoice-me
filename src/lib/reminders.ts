import "server-only";
import { and, eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import { logActivity, SYSTEM_ACTOR } from "@/lib/activity";
import { addDays, daysBetween } from "@/lib/dates";
import { db } from "@/lib/db";
import { clients, documents, remindersSent } from "@/lib/db/schema";
import { sendReminderEmail } from "@/lib/email/documents";
import { loadSettings } from "@/lib/settings";

/** A reminder missed by up to this many days (e.g. cron downtime) is still sent late. */
export const REMINDER_GRACE_DAYS = 3;

export interface ReminderResult {
  documentId: string;
  number: string | null;
  offset: number;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

/**
 * For each unpaid invoice, send the latest reminder step that has come due and
 * hasn't been sent — at most one email per invoice per run, and never for
 * steps that fell due more than REMINDER_GRACE_DAYS ago.
 */
export async function runReminders(today: string): Promise<ReminderResult[]> {
  const settings = await loadSettings();
  if (!settings.remindersEnabled || settings.reminderOffsets.length === 0) return [];
  const offsets = [...settings.reminderOffsets].sort((a, b) => b - a);
  const earliest = Math.min(...offsets);
  const latest = Math.max(...offsets);

  const candidates = await db
    .select({ doc: documents, client: clients })
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(
      and(
        eq(documents.type, "invoice"),
        inArray(documents.status, ["issued", "partially_paid"]),
        gt(documents.balanceDue, "0"),
        isNotNull(documents.dueDate),
        eq(clients.remindersEnabled, true),
        ne(clients.email, ""),
      ),
    );

  const results: ReminderResult[] = [];
  for (const { doc, client } of candidates) {
    const due = doc.dueDate!;
    // Quick window check: skip invoices no step applies to today.
    if (today < addDays(due, earliest) || today > addDays(due, latest + REMINDER_GRACE_DAYS)) continue;

    const sent = new Set(
      (await db.select({ offset: remindersSent.offsetDays }).from(remindersSent).where(eq(remindersSent.documentId, doc.id))).map((r) => r.offset),
    );
    const daysFromDue = daysBetween(due, today);
    const step = offsets.find((o) => o <= daysFromDue && daysFromDue - o <= REMINDER_GRACE_DAYS);
    if (step === undefined || sent.has(step)) continue;
    // A later step already went out (e.g. offsets were edited) — don't go backwards.
    if ([...sent].some((o) => o > step)) continue;

    const claimed = await db.insert(remindersSent).values({ documentId: doc.id, offsetDays: step }).onConflictDoNothing().returning();
    if (claimed.length === 0) continue;

    try {
      const email = await sendReminderEmail(doc, client, settings, today);
      results.push({ documentId: doc.id, number: doc.number, offset: step, status: email.status, error: email.error });
      if (email.status === "failed") {
        // Allow a retry on the next run.
        await db.delete(remindersSent).where(and(eq(remindersSent.documentId, doc.id), eq(remindersSent.offsetDays, step)));
      } else {
        await logActivity(SYSTEM_ACTOR, {
          entityType: "document",
          entityId: doc.id,
          action: "reminder",
          summary: `Sent payment reminder for invoice ${doc.number} to ${client.email}${step > 0 ? ` (${step} days overdue)` : step === 0 ? " (due today)" : ""}`,
        });
      }
    } catch (err) {
      await db.delete(remindersSent).where(and(eq(remindersSent.documentId, doc.id), eq(remindersSent.offsetDays, step)));
      results.push({ documentId: doc.id, number: doc.number, offset: step, status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
