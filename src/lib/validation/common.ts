import { z } from "zod";
import { isValidDateString } from "@/lib/dates";
import { CURRENCIES } from "@/lib/money";
import { GST_STATES, POS_OTHER_COUNTRY, isValidGstin, isValidPan } from "@/lib/tax/gst";

export const text = (max = 500) => z.string().trim().max(max, `Keep this under ${max} characters`);
export const requiredText = (max = 200, message = "Required") => z.string().trim().min(1, message).max(max);

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address");

export const emailList = z
  .string()
  .trim()
  .transform((v) =>
    v
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
  .refine((list) => list.every((e) => z.email().safeParse(e).success), "One of the addresses is not valid");

export const dateString = z.string().refine(isValidDateString, "Enter a valid date");
export const optionalDate = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isValidDateString(v), "Enter a valid date");

export const gstinField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || isValidGstin(v), "Not a valid GSTIN (check the 15 characters and checksum)");

export const panField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || isValidPan(v), "Not a valid PAN (e.g. ABCDE1234F)");

export const stateCodeField = z
  .string()
  .trim()
  .refine((v) => v === "" || v in GST_STATES || v === POS_OTHER_COUNTRY, "Choose a state");

export const currencyField = z.string().trim().toUpperCase().refine((v) => v in CURRENCIES, "Unsupported currency");

export const countryField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use a 2-letter country code");

/** Decimal number as string, e.g. "1234.50". */
export const decimalString = (opts: { min?: number; max?: number; dp?: number; label?: string } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().replace(/,/g, ""))
    .refine((v) => v !== "" && /^-?\d+(\.\d+)?$/.test(v), `${opts.label ?? "Value"} must be a number`)
    .refine((v) => opts.dp === undefined || !v.includes(".") || v.split(".")[1].length <= opts.dp, `At most ${opts.dp} decimal places`)
    .refine((v) => opts.min === undefined || Number(v) >= opts.min, `Must be at least ${opts.min}`)
    .refine((v) => opts.max === undefined || Number(v) <= opts.max, `Must be at most ${opts.max}`);

export const PIN_RE = /^[1-9][0-9]{5}$/;
