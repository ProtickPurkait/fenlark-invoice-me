import { D, dec, money, type Dec } from "@/lib/money";
import { GST_STATES, POS_OTHER_COUNTRY, type ExportTax, type SupplyType } from "@/lib/tax/gst";
import type { DocumentType } from "@/lib/documents/types";

/**
 * GSTR-1 workbook builder. Produces sheets with the column headings of the
 * GST offline utility's Excel template (b2b, b2cl, b2cs, exp, cdnr, cdnur,
 * hsn(b2b), hsn(b2c), docs) so the file can be reviewed and copied across.
 * All values are in INR.
 */

/** Invoices to unregistered recipients above this (inter-state) go to B2CL. */
export const B2CL_THRESHOLD = 100_000;

export interface Gstr1Line {
  hsnSac: string;
  description: string;
  unit: string;
  quantity: string;
  gstRate: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
}

export interface Gstr1Doc {
  type: DocumentType;
  number: string;
  issueDate: string;
  status: string;
  total: string;
  exchangeRate: string;
  supplyType: SupplyType;
  exportTax: ExportTax | null;
  placeOfSupply: string | null;
  reverseCharge: boolean;
  clientName: string;
  clientGstin: string;
  /** For notes: the original invoice's classification. */
  original?: { total: string; exchangeRate: string; supplyType: SupplyType; clientGstin: string; exportTax: ExportTax | null } | null;
  lines: Gstr1Line[];
}

export interface Sheet {
  name: string;
  columns: string[];
  rows: (string | number)[][];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function gstDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

export function posLabel(code: string | null): string {
  if (!code) return "";
  if (code === POS_OTHER_COUNTRY) return "96-Other Countries";
  return `${code}-${GST_STATES[code] ?? ""}`;
}

function inr(value: string | Dec, rate: string): number {
  return Number(money(dec(value).times(rate)));
}

function rateOf(line: Gstr1Line): number {
  return Number(dec(line.gstRate).toString());
}

/**
 * Taxable value per rate for a document (INR). Zero-rated supplies (exports, SEZ
 * under LUT) keep the item's applicable rate; the section / type says no tax was paid.
 */
function byRate(doc: { lines: Gstr1Line[]; exchangeRate: string }) {
  const map = new Map<number, Dec>();
  for (const l of doc.lines) {
    const r = rateOf(l);
    map.set(r, (map.get(r) ?? new D(0)).plus(l.taxable));
  }
  return [...map.entries()].map(([rate, taxable]) => ({ rate, taxable: inr(taxable, doc.exchangeRate) }));
}

function isRegistered(gstin: string): boolean {
  return gstin.trim().length === 15;
}

type Section = "b2b" | "b2cl" | "b2cs" | "exp";

function classify(d: { supplyType: SupplyType; clientGstin: string; total: string; exchangeRate: string }): Section {
  if (d.supplyType === "export") return "exp";
  if (isRegistered(d.clientGstin)) return "b2b";
  if (d.supplyType === "inter" && inr(d.total, d.exchangeRate) > B2CL_THRESHOLD) return "b2cl";
  return "b2cs";
}

function b2bInvoiceType(d: { supplyType: SupplyType; exportTax: ExportTax | null }): string {
  if (d.supplyType === "sez") return d.exportTax === "igst" ? "SEZ supplies with payment" : "SEZ supplies without payment";
  return "Regular B2B";
}

export function buildGstr1(docs: Gstr1Doc[]): Sheet[] {
  const live = docs.filter((d) => d.status !== "void" && d.status !== "draft");
  const invoices = live.filter((d) => d.type === "invoice");
  const notes = live.filter((d) => d.type === "credit_note" || d.type === "debit_note");

  const b2b: Sheet = {
    name: "b2b",
    columns: ["GSTIN/UIN of Recipient", "Receiver Name", "Invoice Number", "Invoice date", "Invoice Value", "Place Of Supply", "Reverse Charge", "Applicable % of Tax Rate", "Invoice Type", "E-Commerce GSTIN", "Rate", "Taxable Value", "Cess Amount"],
    rows: [],
  };
  const b2cl: Sheet = {
    name: "b2cl",
    columns: ["Invoice Number", "Invoice date", "Invoice Value", "Place Of Supply", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount", "E-Commerce GSTIN"],
    rows: [],
  };
  const b2csMap = new Map<string, { pos: string; rate: number; taxable: Dec }>();
  const exp: Sheet = {
    name: "exp",
    columns: ["Export Type", "Invoice Number", "Invoice date", "Invoice Value", "Port Code", "Shipping Bill Number", "Shipping Bill Date", "Rate", "Taxable Value", "Cess Amount"],
    rows: [],
  };

  for (const d of invoices) {
    const section = classify(d);
    const value = inr(d.total, d.exchangeRate);
    if (section === "b2b") {
      for (const r of byRate(d)) {
        b2b.rows.push([d.clientGstin, d.clientName, d.number, gstDate(d.issueDate), value, posLabel(d.placeOfSupply), d.reverseCharge ? "Y" : "N", "", b2bInvoiceType(d), "", r.rate, r.taxable, 0]);
      }
    } else if (section === "b2cl") {
      for (const r of byRate(d)) b2cl.rows.push([d.number, gstDate(d.issueDate), value, posLabel(d.placeOfSupply), "", r.rate, r.taxable, 0, ""]);
    } else if (section === "exp") {
      const withPay = d.exportTax === "igst";
      for (const r of byRate(d)) exp.rows.push([withPay ? "WPAY" : "WOPAY", d.number, gstDate(d.issueDate), value, "", "", "", r.rate, r.taxable, 0]);
    } else {
      for (const r of byRate(d)) addB2cs(b2csMap, posLabel(d.placeOfSupply), r.rate, new D(r.taxable));
    }
  }

  const cdnr: Sheet = {
    name: "cdnr",
    columns: ["GSTIN/UIN of Recipient", "Receiver Name", "Note Number", "Note Date", "Note Type", "Place Of Supply", "Reverse Charge", "Note Supply Type", "Note Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount"],
    rows: [],
  };
  const cdnur: Sheet = {
    name: "cdnur",
    columns: ["UR Type", "Note Number", "Note Date", "Note Type", "Place Of Supply", "Note Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount"],
    rows: [],
  };
  for (const n of notes) {
    const orig = n.original ?? { total: n.total, exchangeRate: n.exchangeRate, supplyType: n.supplyType, clientGstin: n.clientGstin, exportTax: n.exportTax };
    const section = classify(orig);
    const noteType = n.type === "credit_note" ? "C" : "D";
    const value = inr(n.total, n.exchangeRate);
    if (section === "b2b") {
      for (const r of byRate(n)) {
        cdnr.rows.push([orig.clientGstin, n.clientName, n.number, gstDate(n.issueDate), noteType, posLabel(n.placeOfSupply), n.reverseCharge ? "Y" : "N", b2bInvoiceType(orig), value, "", r.rate, r.taxable, 0]);
      }
    } else if (section === "b2cl" || section === "exp") {
      const urType = section === "b2cl" ? "B2CL" : orig.exportTax === "igst" ? "EXPWP" : "EXPWOP";
      for (const r of byRate(n)) cdnur.rows.push([urType, n.number, gstDate(n.issueDate), noteType, posLabel(n.placeOfSupply), value, "", r.rate, r.taxable, 0]);
    } else {
      // Notes on small B2C invoices are netted into B2CS.
      const sign = noteType === "C" ? -1 : 1;
      for (const r of byRate(n)) addB2cs(b2csMap, posLabel(n.placeOfSupply), r.rate, new D(r.taxable).times(sign));
    }
  }

  const b2cs: Sheet = {
    name: "b2cs",
    columns: ["Type", "Place Of Supply", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount", "E-Commerce GSTIN"],
    rows: [...b2csMap.values()]
      .sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate)
      .map((v) => ["OE", v.pos, "", v.rate, Number(money(v.taxable)), 0, ""]),
  };

  return [b2b, b2cl, b2cs, exp, cdnr, cdnur, ...hsnSheets(invoices, notes), docsSheet(docs)];
}

function addB2cs(map: Map<string, { pos: string; rate: number; taxable: Dec }>, pos: string, rate: number, taxable: Dec) {
  const key = `${pos}|${rate}`;
  const row = map.get(key) ?? { pos, rate, taxable: new D(0) };
  row.taxable = row.taxable.plus(taxable);
  map.set(key, row);
}

function hsnSheets(invoices: Gstr1Doc[], notes: Gstr1Doc[]): Sheet[] {
  const columns = ["HSN", "Description", "UQC", "Total Quantity", "Total Value", "Rate", "Taxable Value", "Integrated Tax Amount", "Central Tax Amount", "State/UT Tax Amount", "Cess Amount"];
  type Acc = { hsn: string; desc: string; uqc: string; qty: Dec; value: Dec; rate: number; taxable: Dec; igst: Dec; cgst: Dec; sgst: Dec };
  const b2b = new Map<string, Acc>();
  const b2c = new Map<string, Acc>();
  const add = (doc: Gstr1Doc, sign: number, registered: boolean) => {
    const target = registered ? b2b : b2c;
    for (const l of doc.lines) {
      const rate = rateOf(l);
      const uqc = l.unit || "OTH";
      const key = `${l.hsnSac}|${rate}|${uqc}`;
      const acc = target.get(key) ?? { hsn: l.hsnSac, desc: l.description, uqc, qty: new D(0), value: new D(0), rate, taxable: new D(0), igst: new D(0), cgst: new D(0), sgst: new D(0) };
      const fx = doc.exchangeRate;
      const s = new D(sign);
      acc.qty = acc.qty.plus(dec(l.quantity).times(s));
      const taxable = dec(l.taxable).times(fx);
      const igst = dec(l.igst).times(fx);
      const cgst = dec(l.cgst).times(fx);
      const sgst = dec(l.sgst).times(fx);
      acc.taxable = acc.taxable.plus(taxable.times(s));
      acc.igst = acc.igst.plus(igst.times(s));
      acc.cgst = acc.cgst.plus(cgst.times(s));
      acc.sgst = acc.sgst.plus(sgst.times(s));
      acc.value = acc.value.plus(taxable.plus(igst).plus(cgst).plus(sgst).times(s));
      target.set(key, acc);
    }
  };
  for (const d of invoices) add(d, 1, isRegistered(d.clientGstin));
  for (const n of notes) add(n, n.type === "credit_note" ? -1 : 1, isRegistered(n.original?.clientGstin ?? n.clientGstin));
  const toRows = (map: Map<string, Acc>) =>
    [...map.values()]
      .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate)
      .map((a) => [a.hsn, a.desc.slice(0, 30), a.uqc, Number(a.qty.toDecimalPlaces(2).toString()), Number(money(a.value)), a.rate, Number(money(a.taxable)), Number(money(a.igst)), Number(money(a.cgst)), Number(money(a.sgst)), 0]);
  return [
    { name: "hsn(b2b)", columns, rows: toRows(b2b) },
    { name: "hsn(b2c)", columns, rows: toRows(b2c) },
  ];
}

const NATURE: Partial<Record<DocumentType, string>> = {
  invoice: "Invoices for outward supply",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
};

/** Table 13: number ranges issued in the period, including cancelled (void) documents. */
function docsSheet(docs: Gstr1Doc[]): Sheet {
  const rows: (string | number)[][] = [];
  for (const type of ["invoice", "credit_note", "debit_note"] as const) {
    const series = new Map<string, Gstr1Doc[]>();
    for (const d of docs.filter((x) => x.type === type && x.status !== "draft")) {
      // Group by everything before the trailing sequence digits.
      const prefix = d.number.replace(/\d+$/, "");
      series.set(prefix, [...(series.get(prefix) ?? []), d]);
    }
    for (const list of series.values()) {
      const sorted = [...list].sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
      rows.push([NATURE[type]!, sorted[0].number, sorted[sorted.length - 1].number, sorted.length, sorted.filter((d) => d.status === "void").length]);
    }
  }
  return { name: "docs", columns: ["Nature of Document", "Sr. No. From", "Sr. No. To", "Total Number", "Cancelled"], rows };
}
