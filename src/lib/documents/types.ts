import type { ExportTax } from "@/lib/tax/gst";

export type DocumentType = "invoice" | "quote" | "credit_note" | "debit_note";

export const DOCUMENT_TYPES: DocumentType[] = ["invoice", "quote", "credit_note", "debit_note"];

/**
 * Lifecycle:
 *  invoice      draft → issued → partially_paid → paid        (→ void)
 *  quote        draft → issued → accepted | declined → converted (→ void)
 *  credit/debit draft → issued                                 (→ void)
 * "Sent", "viewed", "overdue" and "expired" are derived from timestamps and dates.
 */
export type DocumentStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "accepted"
  | "declined"
  | "converted"
  | "void";

export type GstRegistration = "regular" | "composition" | "unregistered";

export type DiscountType = "percent" | "amount";

export type PaymentKind = "payment" | "refund";

export type PaymentMethod = "bank_transfer" | "upi" | "card" | "cash" | "cheque" | "gateway" | "other";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer (NEFT/RTGS/IMPS/SWIFT)" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "gateway", label: "Online (payment gateway)" },
  { value: "other", label: "Other" },
];

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

/** Reasons for credit / debit notes (as listed in the GST portal). */
export type NoteReason =
  | "sales_return"
  | "post_sale_discount"
  | "deficiency_in_services"
  | "correction_in_invoice"
  | "change_in_pos"
  | "finalization_of_provisional_assessment"
  | "others";

export const NOTE_REASONS: { value: NoteReason; label: string }[] = [
  { value: "sales_return", label: "Sales return" },
  { value: "post_sale_discount", label: "Post-sale discount" },
  { value: "deficiency_in_services", label: "Deficiency in services" },
  { value: "correction_in_invoice", label: "Correction in invoice" },
  { value: "change_in_pos", label: "Change in place of supply" },
  { value: "finalization_of_provisional_assessment", label: "Finalization of provisional assessment" },
  { value: "others", label: "Others" },
];

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";

export const RECURRING_FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Every 6 months" },
  { value: "yearly", label: "Yearly" },
];

export interface LineTemplate {
  itemId: string | null;
  name: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unit: string;
  rate: string;
  discountType: DiscountType;
  discountValue: string;
  gstRate: string;
}

export interface RecurringTemplate {
  currency: string;
  placeOfSupply: string | null;
  exportTax: ExportTax | null;
  reverseCharge: boolean;
  reference: string;
  subject: string;
  notes: string;
  terms: string;
  lines: LineTemplate[];
}

/** Party details frozen on a document at issue time. */
export interface ClientSnapshot {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  gstin: string;
  pan: string;
  isSez: boolean;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  stateCode: string;
  country: string;
  shippingAddress: string;
}

export interface SellerSnapshot {
  legalName: string;
  tradeName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  stateCode: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  gstRegistration: GstRegistration;
  gstin: string;
  pan: string;
  udyamNumber: string;
  lutArn: string;
  signatoryName: string;
  brandColor: string;
  logoPath: string | null;
  signaturePath: string | null;
  bankAccountName: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankBranch: string;
  bankSwift: string;
  upiId: string;
  upiPayeeName: string;
}

export const DOC_LABELS: Record<DocumentType, { singular: string; plural: string; path: string }> = {
  invoice: { singular: "Invoice", plural: "Invoices", path: "/invoices" },
  quote: { singular: "Quote", plural: "Quotes", path: "/quotes" },
  credit_note: { singular: "Credit note", plural: "Credit notes", path: "/credit-notes" },
  debit_note: { singular: "Debit note", plural: "Debit notes", path: "/debit-notes" },
};

export function documentPath(type: DocumentType, id: string): string {
  return `${DOC_LABELS[type].path}/${id}`;
}

/** Title printed at the top of the PDF. */
export function documentTitle(type: DocumentType, registration: GstRegistration): string {
  switch (type) {
    case "quote":
      return "Quotation";
    case "credit_note":
      return "Credit Note";
    case "debit_note":
      return "Debit Note";
    case "invoice":
      if (registration === "composition") return "Bill of Supply";
      if (registration === "unregistered") return "Invoice";
      return "Tax Invoice";
  }
}

export function isInvoiceLike(type: DocumentType): boolean {
  return type === "invoice";
}

export function isNote(type: DocumentType): type is "credit_note" | "debit_note" {
  return type === "credit_note" || type === "debit_note";
}

export interface DisplayStatus {
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger" | "muted";
}

export interface StatusInput {
  type: DocumentType;
  status: DocumentStatus;
  dueDate: string | null;
  validUntil: string | null;
  sentAt: Date | string | null;
  viewedAt: Date | string | null;
  balanceDue: string;
}

/** Human status combining the stored status with dates (overdue / expired / sent / viewed). */
export function displayStatus(doc: StatusInput, today: string): DisplayStatus {
  switch (doc.status) {
    case "draft":
      return { label: "Draft", tone: "muted" };
    case "void":
      return { label: "Void", tone: "muted" };
    case "paid":
      return { label: "Paid", tone: "success" };
    case "accepted":
      return { label: "Accepted", tone: "success" };
    case "declined":
      return { label: "Declined", tone: "danger" };
    case "converted":
      return { label: "Invoiced", tone: "success" };
    case "partially_paid":
      if (doc.dueDate && doc.dueDate < today) return { label: "Overdue · part paid", tone: "danger" };
      return { label: "Partially paid", tone: "warning" };
    case "issued":
      if (doc.type === "invoice") {
        if (Number(doc.balanceDue) <= 0) return { label: "Settled", tone: "success" };
        if (doc.dueDate && doc.dueDate < today) return { label: "Overdue", tone: "danger" };
        if (doc.viewedAt) return { label: "Viewed", tone: "info" };
        if (doc.sentAt) return { label: "Sent", tone: "info" };
        return { label: "Unpaid", tone: "warning" };
      }
      if (doc.type === "quote") {
        if (doc.validUntil && doc.validUntil < today) return { label: "Expired", tone: "muted" };
        if (doc.viewedAt) return { label: "Viewed", tone: "info" };
        if (doc.sentAt) return { label: "Sent", tone: "info" };
        return { label: "Open", tone: "info" };
      }
      return { label: "Issued", tone: "info" };
  }
}
