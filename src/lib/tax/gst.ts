/**
 * GST rules: state codes, GSTIN validation, supply-type and place-of-supply logic.
 */

/** GST state / UT codes (as used in GSTINs and the place-of-supply field). */
export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

/** Place-of-supply code for supplies to recipients outside India. */
export const POS_OTHER_COUNTRY = "96";

export function stateName(code: string | null | undefined): string {
  if (!code) return "";
  if (code === POS_OTHER_COUNTRY) return "Other Countries";
  return GST_STATES[code] ?? code;
}

export function placeOfSupplyLabel(code: string | null | undefined): string {
  if (!code) return "";
  return `${stateName(code)} (${code})`;
}

export const STATE_OPTIONS = Object.entries(GST_STATES)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Mod-36 checksum used for the 15th GSTIN character. */
export function gstinCheckDigit(first14: string): string {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (total % 36)) % 36];
}

export function normalizeGstin(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidGstin(value: string | null | undefined): boolean {
  const gstin = normalizeGstin(value);
  if (!GSTIN_RE.test(gstin)) return false;
  if (!(gstin.slice(0, 2) in GST_STATES)) return false;
  return gstinCheckDigit(gstin.slice(0, 14)) === gstin[14];
}

export function stateFromGstin(value: string | null | undefined): string | null {
  const gstin = normalizeGstin(value);
  if (gstin.length < 2) return null;
  const code = gstin.slice(0, 2);
  return code in GST_STATES ? code : null;
}

/** PAN embedded in a GSTIN (characters 3–12). */
export function panFromGstin(value: string | null | undefined): string | null {
  const gstin = normalizeGstin(value);
  return GSTIN_RE.test(gstin) ? gstin.slice(2, 12) : null;
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export function isValidPan(value: string | null | undefined): boolean {
  return PAN_RE.test((value ?? "").trim().toUpperCase());
}

export type SupplyType = "intra" | "inter" | "export" | "sez";
export type ExportTax = "lut" | "igst";
export type TaxSplit = "cgst_sgst" | "igst" | "none";

export interface PlaceOfSupplyInput {
  country: string;
  stateCode?: string | null;
  gstin?: string | null;
}

/** Default place of supply: the recipient's state, or 96 for foreign recipients. */
export function defaultPlaceOfSupply(client: PlaceOfSupplyInput): string | null {
  if (client.country && client.country !== "IN") return POS_OTHER_COUNTRY;
  return client.stateCode || stateFromGstin(client.gstin) || null;
}

export interface SupplyTypeInput {
  sellerStateCode: string;
  placeOfSupply: string | null;
  clientCountry: string;
  isSez: boolean;
}

export function determineSupplyType(input: SupplyTypeInput): SupplyType {
  if (input.clientCountry !== "IN" || input.placeOfSupply === POS_OTHER_COUNTRY) return "export";
  if (input.isSez) return "sez";
  if (input.placeOfSupply && input.placeOfSupply === input.sellerStateCode) return "intra";
  return "inter";
}

/** Which tax heads apply for a supply. Exports / SEZ under LUT carry no tax. */
export function taxSplit(gstEnabled: boolean, supplyType: SupplyType, exportTax: ExportTax | null): TaxSplit {
  if (!gstEnabled) return "none";
  if (supplyType === "intra") return "cgst_sgst";
  if (supplyType === "inter") return "igst";
  return exportTax === "igst" ? "igst" : "none";
}

export function isZeroRatedSupply(supplyType: SupplyType): boolean {
  return supplyType === "export" || supplyType === "sez";
}

/** Declaration printed on zero-rated invoices, per Rule 46 / Notification 37/2017. */
export function zeroRatedDeclaration(supplyType: SupplyType, exportTax: ExportTax | null, lutArn?: string | null): string | null {
  if (!isZeroRatedSupply(supplyType)) return null;
  const target = supplyType === "export" ? "EXPORT" : "SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS";
  if (exportTax === "igst") return `SUPPLY MEANT FOR ${target} ON PAYMENT OF INTEGRATED TAX`;
  const lut = lutArn ? ` (LUT ARN: ${lutArn})` : "";
  return `SUPPLY MEANT FOR ${target} UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX${lut}`;
}

/** Common GST Unit Quantity Codes (UQC). */
export const UQC_OPTIONS: { code: string; label: string }[] = [
  { code: "NOS", label: "NOS – Numbers" },
  { code: "PCS", label: "PCS – Pieces" },
  { code: "UNT", label: "UNT – Units" },
  { code: "SET", label: "SET – Sets" },
  { code: "BOX", label: "BOX – Box" },
  { code: "PAC", label: "PAC – Packs" },
  { code: "KGS", label: "KGS – Kilograms" },
  { code: "GMS", label: "GMS – Grams" },
  { code: "LTR", label: "LTR – Litres" },
  { code: "MTR", label: "MTR – Metres" },
  { code: "SQM", label: "SQM – Square metres" },
  { code: "DOZ", label: "DOZ – Dozens" },
  { code: "PRS", label: "PRS – Pairs" },
  { code: "ROL", label: "ROL – Rolls" },
  { code: "OTH", label: "OTH – Others (services)" },
];

export const DEFAULT_GST_RATES = ["0", "0.25", "3", "5", "12", "18", "28", "40"];

/** Common TDS sections Indian clients deduct on payments to vendors. */
export const TDS_SECTIONS: { code: string; label: string }[] = [
  { code: "194J", label: "194J – Professional / technical services" },
  { code: "194C", label: "194C – Contracts" },
  { code: "194H", label: "194H – Commission / brokerage" },
  { code: "194I", label: "194I – Rent" },
  { code: "194Q", label: "194Q – Purchase of goods" },
  { code: "194O", label: "194O – E-commerce operator" },
  { code: "OTHER", label: "Other" },
];
