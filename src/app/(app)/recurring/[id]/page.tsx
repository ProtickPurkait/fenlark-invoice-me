import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentEditorPage } from "@/components/documents/editor-page";
import { todayIST } from "@/lib/dates";
import { db } from "@/lib/db";
import { recurringProfiles } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Recurring invoice" };

export default async function EditRecurringPage(props: PageProps<"/recurring/[id]">) {
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [p] = await db.select().from(recurringProfiles).where(eq(recurringProfiles.id, id));
  if (!p) notFound();
  const t = p.template;
  return (
    <DocumentEditorPage
      type="invoice"
      recurring={{
        profileId: p.id,
        clientId: p.clientId,
        schedule: {
          name: p.name,
          frequency: p.frequency,
          startDate: p.nextRunDate ?? p.startDate,
          endDate: p.endDate,
          maxOccurrences: p.maxOccurrences ?? "",
          paymentTermsDays: p.paymentTermsDays,
          autoIssue: p.autoIssue,
          autoSend: p.autoSend,
        },
        template: {
          type: "invoice",
          clientId: p.clientId,
          issueDate: todayIST(),
          dueDate: null,
          validUntil: null,
          currency: t.currency,
          exchangeRate: t.exchangeRate ?? "1",
          placeOfSupply: t.placeOfSupply ?? "",
          exportTax: t.exportTax,
          reverseCharge: t.reverseCharge,
          reference: t.reference,
          subject: t.subject,
          notes: t.notes,
          terms: t.terms,
          relatedDocumentId: null,
          noteReason: null,
          lines: t.lines,
        },
      }}
    />
  );
}
