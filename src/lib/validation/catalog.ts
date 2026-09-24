import { z } from "zod";
import { stateFromGstin } from "@/lib/tax/gst";
import {
  PIN_RE,
  countryField,
  currencyField,
  decimalString,
  emailList,
  gstinField,
  optionalEmail,
  panField,
  requiredText,
  stateCodeField,
  text,
} from "./common";

export const clientSchema = z
  .object({
    kind: z.enum(["business", "individual"]),
    name: requiredText(200, "Enter the client's legal name"),
    contactName: text(120),
    email: optionalEmail,
    ccEmails: emailList,
    phone: text(40),
    gstin: gstinField,
    pan: panField,
    isSez: z.boolean(),
    addressLine1: text(200),
    addressLine2: text(200),
    city: text(100),
    postalCode: text(20),
    stateCode: stateCodeField,
    country: countryField,
    shippingAddress: text(500),
    currency: currencyField,
    paymentTermsDays: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(365)])
      .nullable()
      .transform((v) => (v === "" || v === null ? null : v)),
    tdsApplicable: z.boolean(),
    tdsRate: z
      .union([z.literal(""), decimalString({ min: 0, max: 30, dp: 2, label: "TDS rate" })])
      .nullable()
      .transform((v) => (v === "" || v === null ? null : v)),
    tdsSection: text(20),
    tan: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^[A-Z]{4}[0-9]{5}[A-Z]$/.test(v), "TAN looks like BLRA12345B"),
    remindersEnabled: z.boolean(),
    portalEnabled: z.boolean(),
    notes: text(2000),
  })
  .superRefine((v, ctx) => {
    if (v.country === "IN") {
      if (!v.stateCode) {
        ctx.addIssue({ code: "custom", path: ["stateCode"], message: "Choose the client's state (decides the place of supply)" });
      }
      if (v.gstin && stateFromGstin(v.gstin) !== v.stateCode) {
        ctx.addIssue({ code: "custom", path: ["stateCode"], message: "State doesn't match the GSTIN" });
      }
      if (v.postalCode && !PIN_RE.test(v.postalCode)) {
        ctx.addIssue({ code: "custom", path: ["postalCode"], message: "Enter a 6-digit PIN code" });
      }
    } else if (v.gstin) {
      ctx.addIssue({ code: "custom", path: ["gstin"], message: "Foreign clients don't have a GSTIN" });
    }
    if (v.isSez && !v.gstin) {
      ctx.addIssue({ code: "custom", path: ["gstin"], message: "SEZ units must have a GSTIN" });
    }
  })
  .transform((v) => ({
    ...v,
    stateCode: v.country === "IN" ? v.stateCode : "",
    isSez: v.country === "IN" ? v.isSez : false,
  }));

export type ClientInput = z.input<typeof clientSchema>;

export const itemSchema = z.object({
  kind: z.enum(["service", "goods"]),
  name: requiredText(200, "Give the item a name"),
  description: text(2000),
  hsnSac: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4,8}$/.test(v), "HSN/SAC is 4–8 digits"),
  unit: z.string().trim().min(1).max(10),
  rate: decimalString({ min: 0, dp: 2, label: "Rate" }),
  gstRate: decimalString({ min: 0, max: 40, dp: 3, label: "GST rate" }),
});

export type ItemInput = z.input<typeof itemSchema>;
