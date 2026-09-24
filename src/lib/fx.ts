import "server-only";
import { todayIST } from "@/lib/dates";

export interface FxRate {
  /** INR per 1 unit of the currency. */
  rate: string;
  /** Date the reference rate is from (may be the previous business day). */
  date: string;
  source: string;
}

/**
 * Reference rate from the European Central Bank via frankfurter.dev (free, no
 * key). For GST the RBI reference rate is the norm, so the editor shows the
 * fetched value as a suggestion the user can overwrite.
 */
export async function fetchInrRate(currency: string, date: string, fetcher: typeof fetch = fetch): Promise<FxRate> {
  if (currency === "INR") return { rate: "1", date, source: "—" };
  const path = date >= todayIST() ? "latest" : date;
  const url = `https://api.frankfurter.dev/v1/${path}?base=${encodeURIComponent(currency)}&symbols=INR`;
  const response = await fetcher(url, { next: { revalidate: 3600 } } as RequestInit);
  if (!response.ok) throw new Error(`Rate service returned ${response.status}`);
  const body = (await response.json()) as { date?: string; rates?: Record<string, number> };
  const rate = body.rates?.INR;
  if (!rate || !Number.isFinite(rate)) throw new Error(`No INR rate for ${currency}`);
  return { rate: rate.toFixed(4), date: body.date ?? date, source: "ECB via frankfurter.dev" };
}
