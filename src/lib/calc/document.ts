import { D, dec, money, round2, type Dec, type Numeric } from "@/lib/money";
import type { DiscountType } from "@/lib/documents/types";
import type { TaxSplit } from "@/lib/tax/gst";

/**
 * Pure document calculator shared by the editor (live totals) and the server
 * (authoritative totals on save/issue). Tax is computed per line and rounded
 * per head, so CGST always equals SGST and the printed columns add up.
 */

export interface LineInput {
  quantity: Numeric;
  rate: Numeric;
  discountType: DiscountType;
  discountValue: Numeric;
  gstRate: Numeric;
  hsnSac?: string;
  unit?: string;
  name?: string;
}

export interface LineResult {
  gross: string;
  discount: string;
  taxable: string;
  gstRate: string;
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  total: string;
}

export interface TaxSummaryRow {
  hsnSac: string;
  gstRate: string;
  quantity: string;
  unit: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
}

export interface CalcInput {
  lines: LineInput[];
  split: TaxSplit;
  /** Round the grand total to the nearest whole unit (INR only). */
  roundOff: boolean;
  /** Recipient pays the tax to the government; it is shown but not collected. */
  reverseCharge?: boolean;
}

export interface CalcResult {
  lines: LineResult[];
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  taxTotal: string;
  roundOff: string;
  total: string;
  taxSummary: TaxSummaryRow[];
}

const ZERO = new D(0);
const HUNDRED = new D(100);

function clampNonNegative(value: Dec): Dec {
  return value.isNegative() ? ZERO : value;
}

export function lineDiscount(gross: Dec, type: DiscountType, value: Numeric): Dec {
  const v = clampNonNegative(dec(value));
  if (type === "percent") {
    const pctValue = D.min(v, HUNDRED);
    return round2(gross.times(pctValue).dividedBy(HUNDRED));
  }
  return round2(D.min(v, gross));
}

export function calculateLine(line: LineInput, split: TaxSplit): LineResult {
  const quantity = dec(line.quantity);
  const rate = dec(line.rate);
  const gross = round2(quantity.times(rate));
  const discount = gross.isNegative() ? ZERO : lineDiscount(gross, line.discountType, line.discountValue);
  const taxable = gross.minus(discount);
  const gstRate = clampNonNegative(dec(line.gstRate));

  let cgstRate = ZERO;
  let sgstRate = ZERO;
  let igstRate = ZERO;
  let cgst = ZERO;
  let sgst = ZERO;
  let igst = ZERO;

  if (split === "cgst_sgst") {
    cgstRate = gstRate.dividedBy(2);
    sgstRate = cgstRate;
    cgst = round2(taxable.times(cgstRate).dividedBy(HUNDRED));
    sgst = cgst;
  } else if (split === "igst") {
    igstRate = gstRate;
    igst = round2(taxable.times(igstRate).dividedBy(HUNDRED));
  }

  const tax = cgst.plus(sgst).plus(igst);
  return {
    gross: money(gross),
    discount: money(discount),
    taxable: money(taxable),
    gstRate: split === "none" ? "0" : gstRate.toString(),
    cgstRate: cgstRate.toString(),
    sgstRate: sgstRate.toString(),
    igstRate: igstRate.toString(),
    cgst: money(cgst),
    sgst: money(sgst),
    igst: money(igst),
    tax: money(tax),
    total: money(taxable.plus(tax)),
  };
}

export function calculateDocument(input: CalcInput): CalcResult {
  const results = input.lines.map((l) => calculateLine(l, input.split));

  let subtotal = ZERO;
  let discountTotal = ZERO;
  let taxableTotal = ZERO;
  let cgstTotal = ZERO;
  let sgstTotal = ZERO;
  let igstTotal = ZERO;

  const summary = new Map<string, TaxSummaryRow & { _q: Dec; _t: Dec; _c: Dec; _s: Dec; _i: Dec; _units: Set<string> }>();

  results.forEach((r, i) => {
    subtotal = subtotal.plus(r.gross);
    discountTotal = discountTotal.plus(r.discount);
    taxableTotal = taxableTotal.plus(r.taxable);
    cgstTotal = cgstTotal.plus(r.cgst);
    sgstTotal = sgstTotal.plus(r.sgst);
    igstTotal = igstTotal.plus(r.igst);

    const line = input.lines[i];
    const hsn = (line.hsnSac ?? "").trim();
    const key = `${hsn}|${r.gstRate}`;
    let row = summary.get(key);
    if (!row) {
      row = {
        hsnSac: hsn,
        gstRate: r.gstRate,
        quantity: "0",
        unit: "",
        taxable: "0",
        cgst: "0",
        sgst: "0",
        igst: "0",
        tax: "0",
        _q: ZERO,
        _t: ZERO,
        _c: ZERO,
        _s: ZERO,
        _i: ZERO,
        _units: new Set(),
      };
      summary.set(key, row);
    }
    row._q = row._q.plus(dec(line.quantity));
    row._t = row._t.plus(r.taxable);
    row._c = row._c.plus(r.cgst);
    row._s = row._s.plus(r.sgst);
    row._i = row._i.plus(r.igst);
    if (line.unit) row._units.add(line.unit);
  });

  const taxTotal = cgstTotal.plus(sgstTotal).plus(igstTotal);
  const payable = input.reverseCharge ? taxableTotal : taxableTotal.plus(taxTotal);
  let roundOff = ZERO;
  let total = payable;
  if (input.roundOff) {
    total = payable.toDecimalPlaces(0, D.ROUND_HALF_UP);
    roundOff = total.minus(payable);
  }

  const taxSummary: TaxSummaryRow[] = [...summary.values()].map((row) => ({
    hsnSac: row.hsnSac,
    gstRate: row.gstRate,
    quantity: row._q.toDecimalPlaces(3).toString(),
    unit: row._units.size === 1 ? [...row._units][0] : row._units.size === 0 ? "" : "OTH",
    taxable: money(row._t),
    cgst: money(row._c),
    sgst: money(row._s),
    igst: money(row._i),
    tax: money(row._c.plus(row._s).plus(row._i)),
  }));

  return {
    lines: results,
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    taxableTotal: money(taxableTotal),
    cgstTotal: money(cgstTotal),
    sgstTotal: money(sgstTotal),
    igstTotal: money(igstTotal),
    taxTotal: money(taxTotal),
    roundOff: money(roundOff),
    total: money(total),
    taxSummary,
  };
}

/** Outstanding amount on an invoice. Negative means the client has overpaid (refund due). */
export function invoiceBalance(input: {
  total: Numeric;
  debited: Numeric;
  credited: Numeric;
  paid: Numeric;
  tds: Numeric;
}): Dec {
  return dec(input.total)
    .plus(dec(input.debited))
    .minus(dec(input.credited))
    .minus(dec(input.paid))
    .minus(dec(input.tds));
}

/** Value in INR for GST reporting of foreign-currency documents. */
export function toInr(amount: Numeric, exchangeRate: Numeric): string {
  return money(dec(amount).times(dec(exchangeRate)));
}
