import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { DocumentEditorPage } from "@/components/documents/editor-page";
import { addMonths, todayIST } from "@/lib/dates";
import { db } from "@/lib/db";
import { documentLines, documents } from "@/lib/db/schema";
import { documentToInput } from "@/lib/documents/service";
import { loadSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New recurring invoice" };

export default async function NewRecurringPage(props: PageProps<"/recurring/new">) {
  const sp = await props.searchParams;
  const settings = await loadSettings();
  const today = todayIST();
  const invoiceId = typeof sp.invoice === "string" && /^[0-9a-f-]{36}$/.test(sp.invoice) ? sp.invoice : null;
  let template = null;
  let clientId: string | null = null;
  let name = "";
  if (invoiceId) {
    const [doc] = await db.select().from(documents).where(eq(documents.id, invoiceId));
    if (doc?.type === "invoice") {
      const lines = await db.select().from(documentLines).where(eq(documentLines.documentId, doc.id));
      template = { ...documentToInput(doc, lines), issueDate: today, dueDate: null, relatedDocumentId: null };
      clientId = doc.clientId;
      name = doc.subject || `Recurring ${doc.clientSnapshot?.name ?? ""}`.trim();
    }
  }
  return (
    <DocumentEditorPage
      type="invoice"
      searchParams={sp}
      recurring={{
        profileId: null,
        template,
        clientId,
        schedule: {
          name,
          frequency: "monthly",
          startDate: invoiceId ? addMonths(today, 1) : today,
          endDate: null,
          maxOccurrences: "",
          paymentTermsDays: settings.paymentTermsDays,
          autoIssue: true,
          autoSend: false,
        },
      }}
    />
  );
}
