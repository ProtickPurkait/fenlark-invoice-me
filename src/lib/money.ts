import Decimal from "decimal.js";

/**
 * All money math goes through decimal.js — never JS floats. Amounts are stored in
 * Postgres as numeric(14,2) and travel through the app as strings like "1234.50".
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export type Numeric = string | number | Dec;

export function dec(value: Numeric | null | undefined): Dec {
  if (value === null || value === undefined || value === "") return new D(0);
  return new D(value);
}

export function round2(value: Numeric): Dec {
  return dec(value).toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** "1234.5" → "1234.50" (always two decimals, suitable for numeric columns). */
export function money(value: Numeric | null | undefined): string {
  return round2(dec(value)).toFixed(2);
}

export function sum(values: Numeric[]): Dec {
  return values.reduce<Dec>((acc, v) => acc.plus(dec(v)), new D(0));
}

export interface CurrencyInfo {
  code: string;
  symbol: string;
  /** Major unit name for amount-in-words, plural. */
  major: string;
  /** Minor unit name for amount-in-words, plural. */
  minor: string;
  locale: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  INR: { code: "INR", symbol: "₹", major: "Rupees", minor: "Paise", locale: "en-IN" },
  USD: { code: "USD", symbol: "$", major: "US Dollars", minor: "Cents", locale: "en-US" },
  EUR: { code: "EUR", symbol: "€", major: "Euros", minor: "Cents", locale: "en-IE" },
  GBP: { code: "GBP", symbol: "£", major: "Pounds Sterling", minor: "Pence", locale: "en-GB" },
  AED: { code: "AED", symbol: "AED", major: "UAE Dirhams", minor: "Fils", locale: "en-AE" },
  SGD: { code: "SGD", symbol: "S$", major: "Singapore Dollars", minor: "Cents", locale: "en-SG" },
  AUD: { code: "AUD", symbol: "A$", major: "Australian Dollars", minor: "Cents", locale: "en-AU" },
  CAD: { code: "CAD", symbol: "C$", major: "Canadian Dollars", minor: "Cents", locale: "en-CA" },
  CHF: { code: "CHF", symbol: "CHF", major: "Swiss Francs", minor: "Centimes", locale: "de-CH" },
  NZD: { code: "NZD", symbol: "NZ$", major: "New Zealand Dollars", minor: "Cents", locale: "en-NZ" },
  SAR: { code: "SAR", symbol: "SAR", major: "Saudi Riyals", minor: "Halalas", locale: "en-SA" },
};

export function currencyInfo(code: string): CurrencyInfo {
  return (
    CURRENCIES[code] ?? { code, symbol: code, major: code, minor: "Cents", locale: "en-US" }
  );
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function numberFormatter(locale: string, withCurrency: string | null): Intl.NumberFormat {
  const key = `${locale}|${withCurrency ?? ""}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(
      locale,
      withCurrency
        ? { style: "currency", currency: withCurrency, minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    );
    formatterCache.set(key, f);
  }
  return f;
}

/**
 * Format an amount for display. INR uses Indian digit grouping (1,23,45,678.50).
 * Intl formats via float, which is exact for 2-decimal values below 2^53 / 100.
 */
export function formatMoney(value: Numeric | null | undefined, currency = "INR"): string {
  const info = currencyInfo(currency);
  const n = Number(money(value));
  try {
    return numberFormatter(info.locale, currency).format(n);
  } catch {
    return `${currency} ${numberFormatter("en-US", null).format(n)}`;
  }
}

/** Number with grouping but no currency symbol (for table cells). */
export function formatAmount(value: Numeric | null | undefined, currency = "INR"): string {
  const info = currencyInfo(currency);
  return numberFormatter(info.locale, null).format(Number(money(value)));
}

/** Quantities: up to 3 decimals, trailing zeros trimmed. */
export function formatQty(value: Numeric | null | undefined): string {
  return dec(value).toDecimalPlaces(3).toString();
}
