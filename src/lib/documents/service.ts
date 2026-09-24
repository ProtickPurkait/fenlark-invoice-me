import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { logActivity, type Actor } from "@/lib/activity";
import { calculateDocument, invoiceBalance } from "@/lib/calc/document";
import { randomToken } from "@/lib/crypto";
import { addDays, financialYear, todayIST } from "@/lib/dates";
import { db, type DbOrTx, type Tx } from "@/lib/db";
import {
  clients,
  documentLines,
  documents,
  payments,
  type BusinessSettings,
  type Client,
  type DocumentLineRow,
  type DocumentRow,
} from "@/lib/db/schema";
import { UserError } from "@/lib/errors";
import { dec, money } from "@/lib/money";
import { loadSettings, sellerSnapshot } from "@/lib/settings";
import { documentSchema, type DocumentInput, type DocumentInputValues } from "@/lib/validation/document";
import { allocateNumber } from "./numbering";
import { taxContext, type TaxContext } from "./tax-context";
import { DOC_LABELS, type ClientSnapshot, type DocumentType, type LineTemplate } from "./types";

function actorUserId(actor: Actor): string | null {
  return actor.type === "user" ? actor.id : null;
}

function label(doc: Pick<DocumentRow, "type" | "number">): string {
  return `${DOC_LABELS[doc.type].singular.toLowerCase()} ${doc.number ?? "(draft)"}`;
}

export function clientSnapshot(c: Client): ClientSnapshot {
  return {
    name: c.name,
    contactName: c.contactName,
    email: c.email,
    phone: c.phone,
    gstin: c.gstin,
    pan: c.pan,
    isSez: c.isSez,
    addressLine1: c.addressLine1,
    addressLine2: c.addressLine2,
    city: c.city,
    postalCode: c.postalCode,
    stateCode: c.stateCode,
    country: c.country,
    shippingAddress: c.shippingAddress,
  };
}

async function lockDocument(tx: Tx, id: string): Promise<DocumentRow> {
  const [doc] = await tx.select().from(documents).where(eq(documents.id, id)).for("update");
  if (!doc) throw new UserError("Document not found");
  return doc;
}

async function loadClient(conn: DbOrTx, id: string): Promise<Client> {
  const [client] = await conn.select().from(clients).where(eq(clients.id, id));
  if (!client) throw new UserError("Client not found", { clientId: "Client not found" });
  return client;
}

interface Resolved {
  ctx: TaxContext;
  currency: string;
  exchangeRate: string;
  placeOfSupply: string;
  reverseCharge: boolean;
}

/** Tax context for a document; credit/debit notes inherit everything from their invoice. */
async function resolveContext(
  conn: DbOrTx,
  input: DocumentInput,
  client: Client,
  settings: BusinessSettings,
): Promise<Resolved & { invoice: DocumentRow | null }> {
  if (input.type === "credit_note" || input.type === "debit_note") {
    const [invoice] = await conn.select().from(documents).where(eq(documents.id, input.relatedDocumentId!));
    if (!invoice || invoice.type !== "invoice") throw new UserError("Original invoice not found", { relatedDocumentId: "Not found" });
    if (invoice.status === "draft" || invoice.status === "void") {
      throw new UserError("Notes can only be raised against an issued invoice");
    }
    if (invoice.clientId !== input.clientId) throw new UserError("The note must be for the same client as the invoice");
    const registration = invoice.sellerSnapshot?.gstRegistration ?? settings.gstRegistration;
    const ctx = taxContext({
      registration,
      sellerStateCode: invoice.sellerSnapshot?.stateCode ?? settings.stateCode,
      placeOfSupply: invoice.placeOfSupply,
      clientCountry: invoice.clientSnapshot?.country ?? client.country,
      isSez: invoice.clientSnapshot?.isSez ?? client.isSez,
      exportTax: invoice.exportTax,
    });
    return {
      ctx: { ...ctx, supplyType: invoice.supplyType },
      currency: invoice.currency,
      exchangeRate: invoice.exchangeRate,
      placeOfSupply: invoice.placeOfSupply ?? "",
      reverseCharge: invoice.reverseCharge,
      invoice,
    };
  }

  const ctx = taxContext({
    registration: settings.gstRegistration,
    sellerStateCode: settings.stateCode,
    placeOfSupply: input.placeOfSupply,
    clientCountry: client.country,
    isSez: client.isSez,
    exportTax: input.exportTax,
  });
  return {
    ctx,
    currency: input.currency,
    exchangeRate: input.currency === "INR" ? "1" : input.exchangeRate,
    placeOfSupply: input.placeOfSupply,
    reverseCharge: ctx.gstEnabled && input.reverseCharge,
    invoice: null,
  };
}

function computeTotals(input: DocumentInput, resolved: Resolved, settings: BusinessSettings) {
  return calculateDocument({
    lines: input.lines,
    split: resolved.ctx.split,
    roundOff: settings.roundOff && resolved.currency === "INR",
    reverseCharge: resolved.reverseCharge,
  });
}

async function writeLines(tx: Tx, documentId: string, input: DocumentInput, calc: ReturnType<typeof calculateDocument>) {
  await tx.delete(documentLines).where(eq(documentLines.documentId, documentId));
  await tx.insert(documentLines).values(
    input.lines.map((l, i) => ({
      documentId,
      position: i,
      itemId: l.itemId,
      name: l.name,
      description: l.description,
      hsnSac: l.hsnSac,
      quantity: l.quantity,
      unit: l.unit,
      rate: l.rate,
      discountType: l.discountType,
      discountValue: l.discountValue,
      // The entered rate is kept even when no tax applies (e.g. export under LUT) so
      // GSTR-1 can report the applicable rate.
      gstRate: l.gstRate,
      gross: calc.lines[i].gross,
      discount: calc.lines[i].discount,
      taxable: calc.lines[i].taxable,
      cgst: calc.lines[i].cgst,
      sgst: calc.lines[i].sgst,
      igst: calc.lines[i].igst,
      total: calc.lines[i].total,
    })),
  );
}

function totalsColumns(calc: ReturnType<typeof calculateDocument>) {
  return {
    subtotal: calc.subtotal,
    discountTotal: calc.discountTotal,
    taxableTotal: calc.taxableTotal,
    cgstTotal: calc.cgstTotal,
    sgstTotal: calc.sgstTotal,
    igstTotal: calc.igstTotal,
    taxTotal: calc.taxTotal,
    roundOff: calc.roundOff,
    total: calc.total,
  };
}

/** Create or update a draft. Returns the document id. */
export async function saveDraft(actor: Actor, id: string | null, raw: DocumentInputValues): Promise<string> {
  const input = documentSchema.parse(raw);
  return db.transaction(async (tx) => {
    let existing: DocumentRow | null = null;
    if (id) {
      existing = await lockDocument(tx, id);
      if (existing.status !== "draft") throw new UserError("Only drafts can be edited. Issued documents are locked — use a credit or debit note to adjust.");
      if (existing.type !== input.type) throw new UserError("Document type can't be changed");
    }
    const settings = await loadSettings(tx);
    const client = await loadClient(tx, input.clientId);
    if (!existing && client.archivedAt) throw new UserError("This client is archived. Restore it first.");
    const resolved = await resolveContext(tx, input, client, settings);
    const calc = computeTotals(input, resolved, settings);

    const terms = client.paymentTermsDays ?? settings.paymentTermsDays;
    const dueDate = input.type === "invoice" || input.type === "debit_note" ? (input.dueDate ?? addDays(input.issueDate, terms)) : null;
    const validUntil = input.type === "quote" ? (input.validUntil ?? addDays(input.issueDate, settings.quoteValidityDays)) : null;

    const values = {
      type: input.type,
      clientId: input.clientId,
      issueDate: input.issueDate,
      dueDate,
      validUntil,
      currency: resolved.currency,
      exchangeRate: resolved.exchangeRate,
      placeOfSupply: resolved.placeOfSupply,
      supplyType: resolved.ctx.supplyType,
      exportTax: resolved.ctx.exportTax,
      reverseCharge: resolved.reverseCharge,
      reference: input.reference,
      subject: input.subject,
      notes: input.notes,
      terms: input.terms,
      relatedDocumentId: input.relatedDocumentId,
      noteReason: input.type === "credit_note" || input.type === "debit_note" ? input.noteReason : null,
      ...totalsColumns(calc),
      balanceDue: input.type === "invoice" ? calc.total : "0",
    };

    let docId: string;
    if (existing) {
      await tx.update(documents).set(values).where(eq(documents.id, existing.id));
      docId = existing.id;
    } else {
      const [row] = await tx
        .insert(documents)
        .values({ ...values, status: "draft", createdBy: actorUserId(actor) })
        .returning({ id: documents.id });
      docId = row.id;
      await logActivity(
        actor,
        {
          entityType: "document",
          entityId: docId,
          action: "create",
          summary: `Created draft ${DOC_LABELS[input.type].singular.toLowerCase()} for ${client.name}`,
        },
        tx,
      );
    }
    await writeLines(tx, docId, input, calc);
    return docId;
  });
}

export function documentToInput(doc: DocumentRow, lines: DocumentLineRow[]): DocumentInputValues {
  return {
    type: doc.type,
    clientId: doc.clientId,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    validUntil: doc.validUntil,
    currency: doc.currency,
    exchangeRate: doc.exchangeRate,
    placeOfSupply: doc.placeOfSupply ?? "",
    exportTax: doc.exportTax,
    reverseCharge: doc.reverseCharge,
    reference: doc.reference,
    subject: doc.subject,
    notes: doc.notes,
    terms: doc.terms,
    relatedDocumentId: doc.relatedDocumentId,
    noteReason: doc.noteReason,
    lines: lines
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        itemId: l.itemId,
        name: l.name,
        description: l.description,
        hsnSac: l.hsnSac,
        quantity: dec(l.quantity).toString(),
        unit: l.unit,
        rate: l.rate,
        discountType: l.discountType,
        discountValue: l.discountValue,
        gstRate: dec(l.gstRate).toString(),
      })),
  };
}

export function linesToTemplate(lines: DocumentInputValues["lines"]): LineTemplate[] {
  return lines.map((l) => ({
    itemId: l.itemId ?? null,
    name: l.name,
    description: l.description,
    hsnSac: l.hsnSac,
    quantity: String(l.quantity),
    unit: l.unit,
    rate: String(l.rate),
    discountType: l.discountType,
    discountValue: String(l.discountValue),
    gstRate: String(l.gstRate),
  }));
}

async function loadLines(conn: DbOrTx, documentId: string): Promise<DocumentLineRow[]> {
  return conn.select().from(documentLines).where(eq(documentLines.documentId, documentId));
}

export function profileProblems(settings: BusinessSettings): string[] {
  const problems: string[] = [];
  if (!settings.legalName) problems.push("legal name");
  if (!settings.addressLine1) problems.push("address");
  if (!settings.stateCode) problems.push("state");
  if (settings.gstRegistration !== "unregistered" && !settings.gstin) problems.push("GSTIN");
  return problems;
}

/** Assign a number, freeze party details and lock the document. */
export async function issueDocument(actor: Actor, id: string): Promise<DocumentRow> {
  return db.transaction(async (tx) => {
    const doc = await lockDocument(tx, id);
    if (doc.status !== "draft") throw new UserError("This document has already been issued");

    const settings = await loadSettings(tx);
    const problems = profileProblems(settings);
    if (problems.length) {
      throw new UserError(`Complete your business profile before issuing (missing: ${problems.join(", ")}). Go to Settings → Business profile.`);
    }
    const client = await loadClient(tx, doc.clientId);
    const input = documentSchema.parse(documentToInput(doc, await loadLines(tx, doc.id)));
    const resolved = await resolveContext(tx, input, client, settings);
    const calc = computeTotals(input, resolved, settings);

    if (resolved.ctx.exportTax === "lut" && resolved.ctx.gstEnabled && doc.type === "invoice") {
      if (!settings.lutArn) {
        throw new UserError("Zero-rated supply under LUT needs your LUT ARN (Settings → Business profile), or switch the invoice to “Pay IGST”.");
      }
      if (settings.lutValidTo && settings.lutValidTo < doc.issueDate) {
        throw new UserError(`Your LUT expired on ${settings.lutValidTo}. File a new one and update Settings, or switch to “Pay IGST”.`);
      }
    }
    if (dec(calc.total).isNegative()) throw new UserError("The total can't be negative");

    if (resolved.invoice && doc.type === "credit_note") {
      const inv = resolved.invoice;
      const creditable = dec(inv.total).plus(inv.debitedTotal).minus(inv.creditedTotal);
      if (dec(calc.total).greaterThan(creditable)) {
        throw new UserError(`This credit note (${money(calc.total)}) is more than the invoice's remaining value (${money(creditable)}).`);
      }
    }

    const { number } = await allocateNumber(tx, doc.type, doc.issueDate);
    const [issued] = await tx
      .update(documents)
      .set({
        ...totalsColumns(calc),
        status: "issued",
        number,
        fy: financialYear(doc.issueDate).short,
        issuedAt: new Date(),
        sellerSnapshot: sellerSnapshot(settings),
        clientSnapshot: clientSnapshot(client),
        supplyType: resolved.ctx.supplyType,
        exportTax: resolved.ctx.exportTax,
        publicToken: randomToken(24),
        balanceDue: doc.type === "invoice" ? calc.total : "0",
      })
      .where(eq(documents.id, doc.id))
      .returning();
    await writeLines(tx, doc.id, input, calc);

    if (resolved.invoice) await recalcInvoice(tx, resolved.invoice.id);

    await logActivity(
      actor,
      {
        entityType: "document",
        entityId: doc.id,
        action: "issue",
        summary: `Issued ${label(issued)} to ${client.name} for ${money(calc.total)} ${doc.currency}`,
      },
      tx,
    );
    return issued;
  });
}

/** Re-derive paid/credited/balance and the payment status of an invoice. */
export async function recalcInvoice(conn: DbOrTx, invoiceId: string): Promise<DocumentRow> {
  const [inv] = await conn.select().from(documents).where(eq(documents.id, invoiceId));
  if (!inv || inv.type !== "invoice") throw new Error(`Invoice ${invoiceId} not found`);

  const [pay] = await conn
    .select({
      paid: sql<string>`coalesce(sum(case when ${payments.kind} = 'refund' then -${payments.amount} else ${payments.amount} end), 0)`,
      tds: sql<string>`coalesce(sum(${payments.tdsAmount}), 0)`,
    })
    .from(payments)
    .where(eq(payments.documentId, invoiceId));
  const [notes] = await conn
    .select({
      credited: sql<string>`coalesce(sum(case when ${documents.type} = 'credit_note' then ${documents.total} else 0 end), 0)`,
      debited: sql<string>`coalesce(sum(case when ${documents.type} = 'debit_note' then ${documents.total} else 0 end), 0)`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.relatedDocumentId, invoiceId),
        inArray(documents.type, ["credit_note", "debit_note"]),
        ne(documents.status, "draft"),
        ne(documents.status, "void"),
      ),
    );

  const balance = invoiceBalance({ total: inv.total, debited: notes.debited, credited: notes.credited, paid: pay.paid, tds: pay.tds });
  let status = inv.status;
  if (status !== "draft" && status !== "void") {
    if (balance.lessThanOrEqualTo(0)) status = "paid";
    else if (dec(pay.paid).plus(pay.tds).greaterThan(0)) status = "partially_paid";
    else status = "issued";
  }
  const [updated] = await conn
    .update(documents)
    .set({
      amountPaid: money(pay.paid),
      tdsAmount: money(pay.tds),
      creditedTotal: money(notes.credited),
      debitedTotal: money(notes.debited),
      balanceDue: status === "void" ? "0" : money(balance),
      status,
    })
    .where(eq(documents.id, invoiceId))
    .returning();
  return updated;
}

export async function voidDocument(actor: Actor, id: string, reason: string): Promise<void> {
  const why = reason.trim();
  if (!why) throw new UserError("Give a reason for voiding", { reason: "Required" });
  await db.transaction(async (tx) => {
    const doc = await lockDocument(tx, id);
    if (doc.status === "draft") throw new UserError("Drafts can simply be deleted");
    if (doc.status === "void") throw new UserError("Already void");
    if (doc.type === "invoice") {
      const [p] = await tx.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.documentId, id));
      if (p.n > 0) throw new UserError("Delete the payments recorded on this invoice before voiding it");
      const [n] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(documents)
        .where(and(eq(documents.relatedDocumentId, id), inArray(documents.type, ["credit_note", "debit_note"]), ne(documents.status, "void")));
      if (n.n > 0) throw new UserError("Void or delete this invoice's credit/debit notes first");
    }
    if (doc.type === "quote" && doc.status === "converted") throw new UserError("This quote was converted to an invoice");

    await tx
      .update(documents)
      .set({ status: "void", voidedAt: new Date(), voidReason: why, balanceDue: "0" })
      .where(eq(documents.id, id));
    if ((doc.type === "credit_note" || doc.type === "debit_note") && doc.relatedDocumentId) {
      await recalcInvoice(tx, doc.relatedDocumentId);
    }
    await logActivity(actor, { entityType: "document", entityId: id, action: "void", summary: `Voided ${label(doc)}: ${why}` }, tx);
  });
}

export async function deleteDraft(actor: Actor, id: string): Promise<DocumentType> {
  return db.transaction(async (tx) => {
    const doc = await lockDocument(tx, id);
    if (doc.status !== "draft") throw new UserError("Only drafts can be deleted. Void issued documents instead.");
    if (doc.type === "invoice" && doc.relatedDocumentId) {
      await tx
        .update(documents)
        .set({ status: "accepted" })
        .where(and(eq(documents.id, doc.relatedDocumentId), eq(documents.type, "quote"), eq(documents.status, "converted")));
    }
    await tx.delete(documents).where(eq(documents.id, id));
    await logActivity(actor, { entityType: "document", entityId: id, action: "delete", summary: `Deleted a draft ${DOC_LABELS[doc.type].singular.toLowerCase()}` }, tx);
    return doc.type;
  });
}

export async function duplicateDocument(actor: Actor, id: string): Promise<string> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) throw new UserError("Document not found");
  if (doc.type !== "invoice" && doc.type !== "quote") throw new UserError("Only invoices and quotes can be duplicated");
  const settings = await loadSettings();
  const input = documentToInput(doc, await loadLines(db, id));
  const today = todayIST();
  return saveDraft(actor, null, {
    ...input,
    issueDate: today,
    dueDate: null,
    validUntil: null,
    relatedDocumentId: null,
    terms: doc.terms || (doc.type === "quote" ? settings.quoteTerms : settings.invoiceTerms),
  });
}

export async function convertQuoteToInvoice(actor: Actor, quoteId: string): Promise<string> {
  const [quote] = await db.select().from(documents).where(eq(documents.id, quoteId));
  if (!quote || quote.type !== "quote") throw new UserError("Quote not found");
  if (quote.status !== "issued" && quote.status !== "accepted") {
    throw new UserError(quote.status === "converted" ? "This quote was already converted" : "Only open or accepted quotes can be converted");
  }
  const settings = await loadSettings();
  const input = documentToInput(quote, await loadLines(db, quoteId));
  const invoiceId = await saveDraft(actor, null, {
    ...input,
    type: "invoice",
    issueDate: todayIST(),
    dueDate: null,
    validUntil: null,
    relatedDocumentId: quoteId,
    notes: settings.invoiceNotes,
    terms: settings.invoiceTerms,
  });
  await db.update(documents).set({ status: "converted" }).where(eq(documents.id, quoteId));
  await logActivity(actor, {
    entityType: "document",
    entityId: quoteId,
    action: "convert",
    summary: `Converted quote ${quote.number} to a draft invoice`,
    data: { invoiceId },
  });
  return invoiceId;
}

export async function respondToQuote(actor: Actor, quoteId: string, response: "accepted" | "declined"): Promise<void> {
  await db.transaction(async (tx) => {
    const quote = await lockDocument(tx, quoteId);
    if (quote.type !== "quote") throw new UserError("Not a quote");
    const allowed = response === "accepted" ? ["issued", "declined"] : ["issued", "accepted"];
    if (!allowed.includes(quote.status)) throw new UserError(`This quote is ${quote.status} and can't be marked ${response}`);
    await tx.update(documents).set({ status: response, respondedAt: new Date() }).where(eq(documents.id, quoteId));
    await logActivity(
      actor,
      { entityType: "document", entityId: quoteId, action: response, summary: `Quote ${quote.number} ${response}` },
      tx,
    );
  });
}

export async function markSent(documentId: string): Promise<void> {
  await db
    .update(documents)
    .set({ sentAt: sql`coalesce(${documents.sentAt}, now())` })
    .where(eq(documents.id, documentId));
}

export async function markViewed(documentId: string): Promise<boolean> {
  const rows = await db
    .update(documents)
    .set({ viewedAt: new Date() })
    .where(and(eq(documents.id, documentId), sql`${documents.viewedAt} is null`))
    .returning({ id: documents.id });
  return rows.length > 0;
}
