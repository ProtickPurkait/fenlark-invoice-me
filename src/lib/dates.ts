/**
 * Date helpers. Business dates (issue date, due date, payment date) are plain
 * `YYYY-MM-DD` strings interpreted in India Standard Time — IST has no DST, so a
 * fixed offset is exact.
 */

export const IST_TIMEZONE = "Asia/Kolkata";

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date in IST for an instant, as `YYYY-MM-DD`. */
export function toISTDate(instant: Date = new Date()): string {
  return isoDateFormatter.format(instant);
}

export function todayIST(): string {
  return toISTDate(new Date());
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parse(value: string): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(value);
  if (!m || !isValidDateString(value)) throw new Error(`Invalid date: ${value}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parse(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export interface FinancialYear {
  /** First year of the FY, e.g. 2026 for FY 2026-27. */
  startYear: number;
  /** `2026-27` */
  long: string;
  /** `26-27` */
  short: string;
  start: string;
  end: string;
}

/** Indian financial year (1 April – 31 March) containing the given date. */
export function financialYear(date: string): FinancialYear {
  const { y, m } = parse(date);
  const startYear = m >= 4 ? y : y - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, "0");
  return {
    startYear,
    long: `${startYear}-${endYY}`,
    short: `${String(startYear % 100).padStart(2, "0")}-${endYY}`,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

export function financialYearFromLong(long: string): FinancialYear {
  const m = /^(\d{4})-\d{2}$/.exec(long);
  if (!m) throw new Error(`Invalid financial year: ${long}`);
  return financialYear(`${m[1]}-04-01`);
}

const displayFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `2026-09-24` → `24 Sept 2026` (en-IN style). */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "";
  const { y, m, d } = parse(date);
  return displayFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: IST_TIMEZONE,
});

export function formatDateTime(instant: Date | string | null | undefined): string {
  if (!instant) return "";
  return dateTimeFormatter.format(typeof instant === "string" ? new Date(instant) : instant);
}

/** Month range helper for reports: `2026-09` → first/last day. */
export function monthRange(yearMonth: string): { start: string; end: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error(`Invalid month: ${yearMonth}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
}

/** Add calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const { y, m, d } = parse(date);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const monthYearFormatter = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** `2026-09-24` → `September 2026` */
export function formatMonthYear(date: string): string {
  const { y, m } = parse(date);
  return monthYearFormatter.format(new Date(Date.UTC(y, m - 1, 1)));
}
