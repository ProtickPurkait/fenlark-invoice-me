import QRCode from "qrcode";
import { amountInWords } from "@/lib/amount-in-words";
import { calculateDocument, toInr } from "@/lib/calc/document";
import { formatDate } from "@/lib/dates";
import type { DocumentLineRow, DocumentRow } from "@/lib/db/schema";
import { supplyTypeLabel } from "@/lib/documents/tax-context";
import { documentTitle, NOTE_REASONS, type ClientSnapshot, type SellerSnapshot } from "@/lib/documents/types";
import { dec, formatAmount, formatMoney } from "@/lib/money";
import { taxSplit, zeroRatedDeclaration } from "@/lib/tax/gst";
import { upiUri } from "@/lib/upi";
import type { PdfData } from "./document-pdf";

export interface PdfSource {
  doc: DocumentRow;
  lines: DocumentLineRow[];
  seller: SellerSnapshot;
  client: ClientSnapshot;
  related: { number: string | null; issueDate: string } | null;
  logo: string | null;
  signature: string | null;
}

/** Pure mapping from stored rows to the printable model (no I/O besides QR encoding). */
export async function buildPdfData(src: PdfSource): Promise<PdfData> {
  const { doc, seller, client } = src;
  const lines = [...src.lines].sort((a, b) => a.position - b.position);
  const registration = seller.gstRegistration;
  const gstDocument = registration === "regular";
  const split = taxSplit(gstDocument, doc.supplyType, doc.exportTax);
  const cur = doc.currency;
  const title = documentTitle(doc.type, registration);
  const isInvoice = doc.type === "invoice";

  const taxSummary = calculateDocument({
    split,
    roundOff: false,
    lines: lines.map((l) => ({
      quantity: l.quantity,
      rate: l.rate,
      discountType: l.discountType,
      discountValue: l.discountValue,
      gstRate: l.gstRate,
      hsnSac: l.hsnSac,
      unit: l.unit,
    })),
  }).taxSummary;

  const meta: PdfData["meta"] = [{ label: "Date", value: formatDate(doc.issueDate) }];
  if ((isInvoice || doc.type === "debit_note") && doc.dueDate) meta.push({ label: "Due date", value: formatDate(doc.dueDate) });
  if (doc.type === "quote" && doc.validUntil) meta.push({ label: "Valid until", value: formatDate(doc.validUntil) });
  if (doc.reference) meta.push({ label: "Reference", value: doc.reference });

  let settlement: PdfData["settlement"] = null;
  const open = Boolean(doc.number) && doc.status !== "void";
  if (isInvoice && open) {
    const rows: NonNullable<PdfData["settlement"]> = [];
    if (dec(doc.debitedTotal).greaterThan(0)) rows.push({ label: "Debit notes", value: `+ ${formatMoney(doc.debitedTotal, cur)}` });
    if (dec(doc.creditedTotal).greaterThan(0)) rows.push({ label: "Credit notes", value: `– ${formatMoney(doc.creditedTotal, cur)}` });
    if (dec(doc.amountPaid).greaterThan(0)) rows.push({ label: "Paid", value: `– ${formatMoney(doc.amountPaid, cur)}` });
    if (dec(doc.tdsAmount).greaterThan(0)) rows.push({ label: "TDS deducted", value: `– ${formatMoney(doc.tdsAmount, cur)}` });
    if (rows.length) {
      rows.push({ label: "Balance due", value: formatMoney(dec(doc.balanceDue).greaterThan(0) ? doc.balanceDue : 0, cur), strong: true });
      settlement = rows;
    }
  }

  // What the client still owes on this document (drafts: the full total).
  const payable = isInvoice ? (doc.number ? dec(doc.balanceDue) : dec(doc.total)) : dec(0);
  const collectPayment = isInvoice && doc.status !== "void" && doc.status !== "paid" && payable.greaterThan(0);

  let bank: PdfData["bank"] = null;
  if (collectPayment && seller.bankAccountNumber) {
    bank = [
      { label: "Account name", value: seller.bankAccountName || seller.legalName },
      { label: "Bank", value: [seller.bankName, seller.bankBranch].filter(Boolean).join(", ") },
      { label: "Account no.", value: seller.bankAccountNumber },
      { label: "IFSC", value: seller.bankIfsc },
      ...(cur !== "INR" && seller.bankSwift ? [{ label: "SWIFT", value: seller.bankSwift }] : []),
    ].filter((r) => r.value);
  }

  let upi: PdfData["upi"] = null;
  if (collectPayment && cur === "INR" && seller.upiId) {
    const uri = upiUri({
      upiId: seller.upiId,
      payeeName: seller.upiPayeeName || seller.tradeName || seller.legalName,
      amount: payable.toFixed(2),
      note: `${title} ${doc.number ?? ""}`.trim(),
    });
    upi = {
      qr: await QRCode.toDataURL(uri, { margin: 0, width: 300, errorCorrectionLevel: "M" }),
      id: seller.upiId,
      amount: formatMoney(payable.toFixed(2), "INR"),
    };
  }

  const related =
    src.related && (doc.type === "credit_note" || doc.type === "debit_note")
      ? { label: "Original invoice", number: src.related.number ?? "—", date: formatDate(src.related.issueDate) }
      : null;

  return {
    type: doc.type,
    title,
    copyLabel: isInvoice && doc.number ? "Original for recipient" : null,
    number: doc.number ?? "DRAFT",
    draft: !doc.number,
    void: doc.status === "void",
    meta,
    seller,
    client,
    placeOfSupply: doc.placeOfSupply,
    supplyLabel: supplyTypeLabel({ supplyType: doc.supplyType, exportTax: doc.exportTax, split, gstEnabled: gstDocument }),
    split,
    reverseCharge: doc.reverseCharge,
    gstDocument,
    currency: cur,
    exchangeRate: doc.exchangeRate,
    lines: lines.map((l) => ({
      name: l.name,
      description: l.description,
      hsnSac: l.hsnSac,
      quantity: l.quantity,
      unit: l.unit,
      rate: l.rate,
      discount: l.discount,
      taxable: l.taxable,
      gstRate: dec(l.gstRate).toString(),
      cgst: l.cgst,
      sgst: l.sgst,
      igst: l.igst,
      total: l.total,
    })),
    totals: {
      subtotal: doc.subtotal,
      discountTotal: doc.discountTotal,
      taxableTotal: doc.taxableTotal,
      cgstTotal: doc.cgstTotal,
      sgstTotal: doc.sgstTotal,
      igstTotal: doc.igstTotal,
      taxTotal: doc.taxTotal,
      roundOff: doc.roundOff,
      total: doc.total,
    },
    inrTaxable: cur !== "INR" ? formatAmount(toInr(doc.taxableTotal, doc.exchangeRate)) : null,
    inrTotal: cur !== "INR" ? formatAmount(toInr(doc.total, doc.exchangeRate)) : null,
    amountInWords: amountInWords(doc.total, cur),
    taxSummary,
    declaration: gstDocument ? zeroRatedDeclaration(doc.supplyType, doc.exportTax, seller.lutArn) : null,
    related,
    noteReason: doc.noteReason ? (NOTE_REASONS.find((r) => r.value === doc.noteReason)?.label ?? null) : null,
    settlement,
    bank,
    upi,
    notes: doc.notes,
    terms: doc.terms,
    logo: src.logo,
    signature: src.signature,
    brandColor: seller.brandColor,
    footer: `This is a computer-generated ${title.toLowerCase()}${doc.type === "quote" ? "" : " and needs no physical signature"}.`,
  };
}
