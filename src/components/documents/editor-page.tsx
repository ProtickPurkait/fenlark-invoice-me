import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/card";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { addDays, todayIST } from "@/lib/dates";
import { db } from "@/lib/db";
import { clients, documentLines, documents, items } from "@/lib/db/schema";
import { documentToInput, profileProblems } from "@/lib/documents/service";
import { DOC_LABELS, documentPath, type DocumentType } from "@/lib/documents/types";
import { dec } from "@/lib/money";
import { loadSettings } from "@/lib/settings";
import { defaultPlaceOfSupply } from "@/lib/tax/gst";
import { emptyLine, type DocumentInputValues } from "@/lib/validation/document";
import { DocumentEditor, type EditorInvoiceRef } from "./document-editor";

export async function DocumentEditorPage({
  type,
  documentId,
  searchParams,
}: {
  type: DocumentType;
  documentId?: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await requireUser();
  if (!can(user.role, "documents:write")) redirect(DOC_LABELS[type].path);
  const settings = await loadSettings();
  const isNote = type === "credit_note" || type === "debit_note";

  const [clientRows, itemRows] = await Promise.all([
    db.select().from(clients).where(isNull(clients.archivedAt)).orderBy(asc(clients.name)),
    db.select().from(items).where(isNull(items.archivedAt)).orderBy(asc(items.name)),
  ]);

  let defaults: DocumentInputValues;
  if (documentId) {
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!doc || doc.type !== type) notFound();
    if (doc.status !== "draft") redirect(documentPath(type, doc.id));
    const lines = await db.select().from(documentLines).where(eq(documentLines.documentId, doc.id));
    defaults = documentToInput(doc, lines);
    // An archived client stays selectable on its own drafts.
    if (!clientRows.some((c) => c.id === doc.clientId)) {
      const [c] = await db.select().from(clients).where(eq(clients.id, doc.clientId));
      if (c) clientRows.push(c);
    }
  } else {
    const today = todayIST();
    const clientParam = typeof searchParams?.client === "string" ? searchParams.client : null;
    const client = clientRows.find((c) => c.id === clientParam) ?? null;
    defaults = {
      type,
      clientId: client?.id ?? "",
      issueDate: today,
      dueDate: null,
      validUntil: null,
      currency: client?.currency ?? settings.defaultCurrency,
      exchangeRate: (client?.currency ?? settings.defaultCurrency) === "INR" ? "1" : "",
      placeOfSupply: client ? (defaultPlaceOfSupply(client) ?? "") : "",
      exportTax: null,
      reverseCharge: false,
      reference: "",
      subject: "",
      notes: type === "quote" ? "" : type === "invoice" ? settings.invoiceNotes : "",
      terms: type === "quote" ? settings.quoteTerms : type === "invoice" ? settings.invoiceTerms : "",
      relatedDocumentId: null,
      noteReason: null,
      lines: [emptyLine()],
    };
    if (type === "invoice") defaults.dueDate = addDays(today, client?.paymentTermsDays ?? settings.paymentTermsDays);
    if (type === "quote") defaults.validUntil = addDays(today, settings.quoteValidityDays);
  }

  let invoices: EditorInvoiceRef[] | undefined;
  if (isNote) {
    const rows = await db
      .select({ doc: documents, clientName: clients.name })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .where(and(eq(documents.type, "invoice"), inArray(documents.status, ["issued", "partially_paid", "paid"])))
      .orderBy(desc(documents.issueDate), desc(documents.number))
      .limit(500);
    const byId = new Map(rows.map((r) => [r.doc.id, r.doc]));
    invoices = rows.map(({ doc: d, clientName }) => ({
      id: d.id,
      number: d.number ?? "",
      issueDate: d.issueDate,
      clientId: d.clientId,
      clientName,
      currency: d.currency,
      exchangeRate: d.exchangeRate,
      placeOfSupply: d.placeOfSupply,
      supplyType: d.supplyType,
      exportTax: d.exportTax,
      reverseCharge: d.reverseCharge,
      total: d.total,
    }));

    // New note from an invoice page: pre-select it and copy its lines as a starting point.
    const invoiceParam = typeof searchParams?.invoice === "string" ? searchParams.invoice : null;
    const inv = !documentId && invoiceParam ? invoices.find((i) => i.id === invoiceParam) : undefined;
    if (inv) {
      const invLines = await db.select().from(documentLines).where(eq(documentLines.documentId, inv.id));
      const source = byId.get(inv.id)!;
      const input = documentToInput(source, invLines);
      defaults = {
        ...defaults,
        relatedDocumentId: inv.id,
        clientId: inv.clientId,
        currency: inv.currency,
        exchangeRate: inv.exchangeRate,
        placeOfSupply: inv.placeOfSupply ?? "",
        exportTax: inv.exportTax,
        reverseCharge: inv.reverseCharge,
        noteReason: type === "credit_note" ? "post_sale_discount" : "correction_in_invoice",
        lines: input.lines,
      };
    }
  }

  const label = DOC_LABELS[type];
  const backHref = documentId ? documentPath(type, documentId) : label.path;
  return (
    <>
      <PageHeader
        title={documentId ? `Edit draft ${label.singular.toLowerCase()}` : `New ${label.singular.toLowerCase()}`}
        back={
          <Link href={backHref} className="text-sm text-zinc-500 hover:text-zinc-800">
            ← {documentId ? "Back" : label.plural}
          </Link>
        }
      />
      <DocumentEditor
        documentId={documentId ?? null}
        defaults={defaults}
        canCreateClients={can(user.role, "clients:write")}
        clients={clientRows.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          gstin: c.gstin,
          country: c.country,
          stateCode: c.stateCode,
          isSez: c.isSez,
          currency: c.currency,
          paymentTermsDays: c.paymentTermsDays,
        }))}
        items={itemRows.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          hsnSac: i.hsnSac,
          unit: i.unit,
          rate: i.rate,
          gstRate: dec(i.gstRate).toString(),
        }))}
        settings={{
          registration: settings.gstRegistration,
          stateCode: settings.stateCode,
          roundOff: settings.roundOff,
          paymentTermsDays: settings.paymentTermsDays,
          quoteValidityDays: settings.quoteValidityDays,
          defaultCurrency: settings.defaultCurrency,
          hasLut: Boolean(settings.lutArn),
          profileProblems: profileProblems(settings),
        }}
        invoices={invoices}
      />
    </>
  );
}
