import { currencyInfo, dec, type Numeric } from "./money";

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** Indian numbering: crore (10^7), lakh (10^5), thousand, hundred. */
export function indianWords(n: bigint): string {
  if (n === BigInt(0)) return "Zero";
  const parts: string[] = [];
  const crore = n / BigInt(10_000_000);
  let rest = Number(n % BigInt(10_000_000));
  if (crore > BigInt(0)) parts.push(`${indianWords(crore)} Crore`);
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** International numbering: billion, million, thousand. */
export function internationalWords(n: bigint): string {
  if (n === BigInt(0)) return "Zero";
  const scales = ["", "Thousand", "Million", "Billion", "Trillion"];
  const parts: string[] = [];
  let i = 0;
  let rest = n;
  while (rest > BigInt(0)) {
    const chunk = Number(rest % BigInt(1000));
    if (chunk) parts.unshift(scales[i] ? `${belowThousand(chunk)} ${scales[i]}` : belowThousand(chunk));
    rest /= BigInt(1000);
    i += 1;
  }
  return parts.join(" ");
}

/**
 * "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only"
 * INR uses the Indian system; other currencies use the international system.
 */
export function amountInWords(amount: Numeric, currency = "INR"): string {
  const value = dec(amount).abs().toDecimalPlaces(2);
  const [intPart, fracPart = "00"] = value.toFixed(2).split(".");
  const major = BigInt(intPart);
  const minor = Number(fracPart);
  const info = currencyInfo(currency);
  const words = currency === "INR" ? indianWords : internationalWords;

  let text = `${info.major} ${words(major)}`;
  if (minor) text += ` and ${belowHundred(minor)} ${info.minor}`;
  return `${text} Only`;
}
