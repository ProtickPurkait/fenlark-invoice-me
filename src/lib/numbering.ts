import { financialYear } from "@/lib/dates";

/**
 * Document number formatting. GST (Rule 46(b)) requires a consecutive serial
 * number of at most 16 characters, unique for the financial year, containing
 * only letters, digits, hyphen "-" and slash "/".
 */

export const NUMBER_TOKENS = ["{PREFIX}", "{FY}", "{FYLONG}", "{YYYY}", "{YY}", "{MM}", "{SEQ}"] as const;

export const MAX_GST_NUMBER_LENGTH = 16;
const ALLOWED = /^[A-Za-z0-9/-]+$/;

export interface FormatNumberInput {
  pattern: string;
  prefix: string;
  sequence: number;
  padding: number;
  /** Issue date, YYYY-MM-DD. */
  date: string;
}

export function formatDocumentNumber(input: FormatNumberInput): string {
  const fy = financialYear(input.date);
  const [yyyy, mm] = input.date.split("-");
  const seq = String(input.sequence).padStart(Math.max(0, Math.min(input.padding, 10)), "0");
  return input.pattern
    .replaceAll("{PREFIX}", input.prefix)
    .replaceAll("{FYLONG}", fy.long)
    .replaceAll("{FY}", fy.short)
    .replaceAll("{YYYY}", yyyy)
    .replaceAll("{YY}", yyyy.slice(2))
    .replaceAll("{MM}", mm)
    .replaceAll("{SEQ}", seq);
}

/** Counter bucket: one per financial year when the series resets yearly. */
export function counterPeriod(date: string, resetYearly: boolean): string {
  return resetYearly ? financialYear(date).short : "all";
}

export interface NumberCheck {
  ok: boolean;
  error?: string;
}

export function checkDocumentNumber(number: string): NumberCheck {
  if (!number) return { ok: false, error: "Number is empty" };
  if (number.length > MAX_GST_NUMBER_LENGTH) {
    return { ok: false, error: `"${number}" is ${number.length} characters; GST allows at most ${MAX_GST_NUMBER_LENGTH}` };
  }
  if (!ALLOWED.test(number)) {
    return { ok: false, error: `"${number}" may only contain letters, digits, "-" and "/"` };
  }
  return { ok: true };
}

/** Validate a series pattern by formatting a worst-case sample number. */
export function checkSeriesPattern(pattern: string, prefix: string, padding: number): NumberCheck {
  if (!pattern.includes("{SEQ}")) return { ok: false, error: "Pattern must include {SEQ}" };
  if (/\{[A-Z]+\}/.test(pattern.replace(/\{(PREFIX|FY|FYLONG|YYYY|YY|MM|SEQ)\}/g, ""))) {
    return { ok: false, error: `Unknown token. Use ${NUMBER_TOKENS.join(" ")}` };
  }
  const sample = formatDocumentNumber({
    pattern,
    prefix,
    padding,
    sequence: Math.max(1, 10 ** Math.max(padding, 1) - 1),
    date: "2026-12-31",
  });
  return checkDocumentNumber(sample);
}
