import { z } from "zod";
import { checkSeriesPattern } from "@/lib/numbering";
import { panFromGstin, stateFromGstin } from "@/lib/tax/gst";
import { isValidUpiId } from "@/lib/upi";
import {
  PIN_RE,
  countryField,
  currencyField,
  gstinField,
  optionalDate,
  optionalEmail,
  panField,
  requiredText,
  stateCodeField,
  text,
} from "./common";

export const businessProfileSchema = z
  .object({
    legalName: requiredText(200, "Enter the legal name registered for GST / PAN"),
    tradeName: text(200),
    addressLine1: requiredText(200, "Enter the registered address"),
    addressLine2: text(200),
    city: text(100),
    postalCode: text(20),
    stateCode: stateCodeField.refine((v) => v !== "", "Choose the state of your registered office"),
    country: countryField,
    email: optionalEmail,
    phone: text(40),
    website: text(200),
    gstRegistration: z.enum(["regular", "composition", "unregistered"]),
    gstin: gstinField,
    pan: panField,
    udyamNumber: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(v), "Format: UDYAM-XX-00-0000000"),
    lutArn: text(40),
    lutValidFrom: optionalDate,
    lutValidTo: optionalDate,
    signatoryName: text(120),
    brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0f766e"),
  })
  .superRefine((v, ctx) => {
    if (v.country === "IN" && v.postalCode && !PIN_RE.test(v.postalCode)) {
      ctx.addIssue({ code: "custom", path: ["postalCode"], message: "Enter a 6-digit PIN code" });
    }
    if (v.gstRegistration !== "unregistered") {
      if (!v.gstin) {
        ctx.addIssue({ code: "custom", path: ["gstin"], message: "GSTIN is required for GST-registered businesses" });
      } else if (stateFromGstin(v.gstin) !== v.stateCode) {
        ctx.addIssue({ code: "custom", path: ["stateCode"], message: "State must match the first two digits of your GSTIN" });
      }
    }
    if (v.gstin && v.pan && panFromGstin(v.gstin) !== v.pan) {
      ctx.addIssue({ code: "custom", path: ["pan"], message: "PAN doesn't match the one inside your GSTIN" });
    }
    if (v.lutValidFrom && v.lutValidTo && v.lutValidTo < v.lutValidFrom) {
      ctx.addIssue({ code: "custom", path: ["lutValidTo"], message: "End date is before the start date" });
    }
  })
  .transform((v) => ({ ...v, pan: v.pan || panFromGstin(v.gstin) || "" }));

export type BusinessProfileInput = z.input<typeof businessProfileSchema>;

export const paymentDetailsSchema = z.object({
  bankAccountName: text(120),
  bankName: text(120),
  bankAccountNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9A-Za-z]{6,34}$/.test(v), "Enter the account number without spaces"),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), "IFSC looks like HDFC0001234"),
  bankBranch: text(120),
  bankSwift: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), "SWIFT/BIC is 8 or 11 characters"),
  upiId: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidUpiId(v), "UPI ID looks like name@bank"),
  upiPayeeName: text(50),
});

export type PaymentDetailsInput = z.input<typeof paymentDetailsSchema>;

export const invoiceDefaultsSchema = z.object({
  defaultCurrency: currencyField,
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  quoteValidityDays: z.coerce.number().int().min(1).max(365),
  roundOff: z.boolean(),
  invoiceNotes: text(2000),
  invoiceTerms: text(4000),
  quoteTerms: text(4000),
});

export type InvoiceDefaultsInput = z.input<typeof invoiceDefaultsSchema>;

export const remindersSchema = z.object({
  remindersEnabled: z.boolean(),
  reminderOffsets: z
    .array(z.coerce.number().int().min(-30).max(120))
    .max(8, "At most 8 reminders")
    .transform((list) => [...new Set(list)].sort((a, b) => a - b)),
  sendPaymentReceipts: z.boolean(),
  bccEmail: optionalEmail,
});

export type RemindersInput = z.input<typeof remindersSchema>;

export const seriesSchema = z
  .object({
    docType: z.enum(["invoice", "quote", "credit_note", "debit_note"]),
    prefix: z
      .string()
      .trim()
      .max(10)
      .regex(/^[A-Za-z0-9/-]*$/, "Letters, digits, - and / only"),
    pattern: z.string().trim().min(1).max(40),
    padding: z.coerce.number().int().min(1).max(8),
    resetYearly: z.boolean(),
    /** Optional: set the next number for the current period (to continue an existing series). */
    nextNumber: z.coerce.number().int().min(1).max(99_999_999).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const check = checkSeriesPattern(v.pattern, v.prefix, v.padding);
    if (!check.ok) ctx.addIssue({ code: "custom", path: ["pattern"], message: check.error ?? "Invalid pattern" });
  });

export type SeriesInput = z.input<typeof seriesSchema>;

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address" })),
  name: text(120),
  role: z.enum(["admin", "staff", "viewer"]),
});

export type InviteInput = z.input<typeof inviteSchema>;
