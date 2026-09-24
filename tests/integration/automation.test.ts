import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { businessSettings, documents, recurringProfiles } from "@/lib/db/schema";
import { issueDocument, saveDraft } from "@/lib/documents/service";
import { captureOutbox, releaseOutbox } from "@/lib/email/send";
import { recordPayment } from "@/lib/payments/service";
import { advance, fillPlaceholders, runDueProfiles, saveProfile } from "@/lib/recurring/service";
import { runReminders } from "@/lib/reminders";
import { draftInput, seedBusiness, seedClient, seedUser } from "../helpers/fixtures";
import { setupTestDb, teardownTestDb } from "../helpers/db";

describe("reminders", () => {
  let outbox: ReturnType<typeof captureOutbox>;
  beforeEach(async () => {
    await setupTestDb();
    await seedBusiness({ remindersEnabled: true, reminderOffsets: [-3, 0, 7, 14] });
    outbox = captureOutbox();
  });
  afterAll(async () => {
    releaseOutbox();
    await teardownTestDb();
  });

  async function invoiceDue(due: string, clientOver = {}) {
    const actor = await seedUser().catch(() => ({ type: "system" as const, id: null, label: "System" }));
    const client = await seedClient(clientOver);
    const id = await saveDraft(actor, null, draftInput(client.id, { issueDate: "2026-09-01", dueDate: due }));
    return issueDocument(actor, id);
  }

  it("sends each step once, on schedule", async () => {
    const inv = await invoiceDue("2026-10-10");
    expect(await runReminders("2026-10-06")).toHaveLength(0);
    const before = await runReminders("2026-10-07");
    expect(before).toMatchObject([{ offset: -3, status: "sent" }]);
    expect(outbox[0].subject).toContain(`Reminder: invoice ${inv.number} is due on`);
    expect(outbox[0].attachments[0]).toMatch(/\.pdf$/);
    expect(await runReminders("2026-10-07")).toHaveLength(0);
    expect(await runReminders("2026-10-10")).toMatchObject([{ offset: 0 }]);
    expect(await runReminders("2026-10-18")).toMatchObject([{ offset: 7 }]);
    expect(outbox[2].subject).toContain("Overdue");
    expect(outbox[2].subject).toContain("(8 days)");
  });

  it("catches up within the grace window but not beyond", async () => {
    await invoiceDue("2026-10-10");
    // Cron was down on the due date; two days later it still goes out.
    expect(await runReminders("2026-10-12")).toMatchObject([{ offset: 0 }]);
    // 7-day step fell due on the 17th; by the 25th it's too stale.
    expect(await runReminders("2026-10-25")).toMatchObject([{ offset: 14 }]);
    expect(await runReminders("2026-11-30")).toHaveLength(0);
  });

  it("skips paid invoices, opted-out clients and disabled reminders", async () => {
    const inv = await invoiceDue("2026-10-10");
    await recordPayment({ type: "system", id: null, label: "System" }, { documentId: inv.id, kind: "payment", date: "2026-10-01", amount: inv.total, tdsAmount: "0", tdsSection: "", method: "upi", reference: "", notes: "" });
    await invoiceDue("2026-10-10", { name: "No reminders Ltd", remindersEnabled: false });
    expect(await runReminders("2026-10-10")).toHaveLength(0);
    await invoiceDue("2026-10-10", { name: "No email Ltd", email: "" });
    expect(await runReminders("2026-10-10")).toHaveLength(0);
    await db.update(businessSettings).set({ remindersEnabled: false }).where(eq(businessSettings.id, 1));
    await invoiceDue("2026-10-10", { name: "Should remind Ltd" });
    expect(await runReminders("2026-10-10")).toHaveLength(0);
  });
});

describe("recurring invoices", () => {
  let outbox: ReturnType<typeof captureOutbox>;
  beforeEach(async () => {
    await setupTestDb();
    await seedBusiness();
    outbox = captureOutbox();
  });
  afterAll(async () => {
    releaseOutbox();
    await teardownTestDb();
  });

  it("advances dates by frequency, clamping month ends", () => {
    expect(advance("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advance("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(advance("2026-09-24", "weekly")).toBe("2026-10-01");
    expect(advance("2028-02-29", "yearly")).toBe("2029-02-28");
    expect(fillPlaceholders("Retainer — {MONTH}", "2026-09-24")).toBe("Retainer — September 2026");
  });

  it("creates, issues and emails invoices on schedule and stops at the limit", async () => {
    const actor = await seedUser();
    const client = await seedClient();
    const base = draftInput(client.id);
    const id = await saveProfile(actor, null, {
      schedule: { name: "Retainer", frequency: "monthly", startDate: "2026-10-01", endDate: null, maxOccurrences: 2, paymentTermsDays: 10, autoIssue: true, autoSend: true },
      document: { ...base, subject: "Retainer {MONTH}", lines: [{ ...base.lines[0], name: "Support — {MONTH}" }] },
    });

    expect(await runDueProfiles("2026-09-30")).toHaveLength(0);
    const [first] = await runDueProfiles("2026-10-01");
    expect(first).toMatchObject({ number: "FL/26-27/0001", sent: true });
    const [inv] = await db.select().from(documents).where(eq(documents.id, first.documentId!));
    expect(inv).toMatchObject({ subject: "Retainer October 2026", dueDate: "2026-10-11", recurringProfileId: id, status: "issued" });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].attachments).toHaveLength(1);

    // Running again the same day does nothing.
    expect(await runDueProfiles("2026-10-01")).toHaveLength(0);

    const [second] = await runDueProfiles("2026-11-03");
    expect(second.number).toBe("FL/26-27/0002");
    const [profile] = await db.select().from(recurringProfiles).where(eq(recurringProfiles.id, id));
    expect(profile).toMatchObject({ status: "ended", occurrences: 2, nextRunDate: null });
  });

  it("leaves a draft and logs the error when issuing fails", async () => {
    const actor = await seedUser();
    const client = await seedClient();
    await saveProfile(actor, null, {
      schedule: { name: "Draft only", frequency: "weekly", startDate: "2026-10-01", endDate: null, maxOccurrences: null, paymentTermsDays: 7, autoIssue: true, autoSend: false },
      document: draftInput(client.id),
    });
    await db.update(businessSettings).set({ gstin: "" }).where(eq(businessSettings.id, 1));
    const [result] = await runDueProfiles("2026-10-01");
    expect(result.error).toMatch(/business profile/);
    const [draft] = await db.select().from(documents).where(eq(documents.id, result.documentId!));
    expect(draft.status).toBe("draft");
  });
});
