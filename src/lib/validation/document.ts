import { z } from "zod";
import { currencyField, dateString, decimalString, optionalDate, text } from "./common";

export const lineSchema = z.object({
  itemId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  name: z.string().trim().min(1, "Describe the item").max(300),
  description: text(2000),
  hsnSac: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4,8}$/.test(v), "HSN/SAC is 4–8 digits"),
  quantity: decimalString({ min: 0.001, dp: 3, label: "Quantity" }),
  unit: z.string().trim().min(1).max(10),
  rate: decimalString({ min: 0, dp: 2, label: "Rate" }),
  discountType: z.enum(["percent", "amount"]),
  discountValue: z
    .union([z.literal(""), decimalString({ min: 0, dp: 2, label: "Discount" })])
    .transform((v) => (v === "" ? "0" : v)),
  gstRate: decimalString({ min: 0, max: 40, dp: 3, label: "GST rate" }),
});

export type LineInputValues = z.input<typeof lineSchema>;

export function emptyLine(): LineInputValues {
  return {
    itemId: null,
    name: "",
    description: "",
    hsnSac: "",
    quantity: "1",
    unit: "OTH",
    rate: "",
    discountType: "percent",
    discountValue: "",
    gstRate: "18",
  };
}

export const documentSchema = z
  .object({
    type: z.enum(["invoice", "quote", "credit_note", "debit_note"]),
    clientId: z.string().uuid({ error: "Choose a client" }),
    issueDate: dateString,
    dueDate: optionalDate,
    validUntil: optionalDate,
    currency: currencyField,
    exchangeRate: decimalString({ min: 0.000001, label: "Exchange rate" }),
    placeOfSupply: z.string().trim().min(2, "Choose the place of supply").max(2),
    exportTax: z.enum(["lut", "igst"]).nullable().optional().transform((v) => v ?? null),
    reverseCharge: z.boolean(),
    reference: text(100),
    subject: text(200),
    notes: text(2000),
    terms: text(4000),
    relatedDocumentId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    noteReason: z
      .enum([
        "sales_return",
        "post_sale_discount",
        "deficiency_in_services",
        "correction_in_invoice",
        "change_in_pos",
        "finalization_of_provisional_assessment",
        "others",
      ])
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    lines: z.array(lineSchema).min(1, "Add at least one line").max(200),
  })
  .superRefine((v, ctx) => {
    if (v.dueDate && v.dueDate < v.issueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date is before the issue date" });
    }
    if (v.validUntil && v.validUntil < v.issueDate) {
      ctx.addIssue({ code: "custom", path: ["validUntil"], message: "Must be on or after the quote date" });
    }
    if ((v.type === "credit_note" || v.type === "debit_note") && !v.relatedDocumentId) {
      ctx.addIssue({ code: "custom", path: ["relatedDocumentId"], message: "Choose the original invoice" });
    }
    if ((v.type === "credit_note" || v.type === "debit_note") && !v.noteReason) {
      ctx.addIssue({ code: "custom", path: ["noteReason"], message: "Choose a reason" });
    }
    if (v.currency === "INR" && Number(v.exchangeRate) !== 1) {
      ctx.addIssue({ code: "custom", path: ["exchangeRate"], message: "INR documents use an exchange rate of 1" });
    }
  });

export type DocumentInputValues = z.input<typeof documentSchema>;
export type DocumentInput = z.output<typeof documentSchema>;

export const paymentSchema = z
  .object({
    documentId: z.string().uuid(),
    kind: z.enum(["payment", "refund"]),
    date: dateString,
    amount: z.union([z.literal(""), decimalString({ min: 0, dp: 2, label: "Amount" })]).transform((v) => (v === "" ? "0" : v)),
    tdsAmount: z
      .union([z.literal(""), decimalString({ min: 0, dp: 2, label: "TDS" })])
      .transform((v) => (v === "" ? "0" : v)),
    tdsSection: text(20),
    method: z.enum(["bank_transfer", "upi", "card", "cash", "cheque", "gateway", "other"]),
    reference: text(120),
    notes: text(1000),
    sendReceipt: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    if (Number(v.amount) <= 0 && Number(v.tdsAmount) <= 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the amount received" });
    }
    if (v.kind === "refund" && Number(v.tdsAmount) > 0) {
      ctx.addIssue({ code: "custom", path: ["tdsAmount"], message: "Refunds don't carry TDS" });
    }
  });

export type PaymentInputValues = z.input<typeof paymentSchema>;
