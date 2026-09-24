import { describe, expect, it } from "vitest";
import { buildGstr1, gstDate, posLabel, type Gstr1Doc } from "@/lib/reports/gstr1";

const line = (over: Partial<Gstr1Doc["lines"][number]> = {}) => ({
  hsnSac: "998314",
  description: "Design",
  unit: "OTH",
  quantity: "1",
  gstRate: "18",
  taxable: "10000.00",
  cgst: "0.00",
  sgst: "0.00",
  igst: "1800.00",
  ...over,
});

const doc = (over: Partial<Gstr1Doc>): Gstr1Doc => ({
  type: "invoice",
  number: "FL/26-27/0001",
  issueDate: "2026-09-10",
  status: "issued",
  total: "11800.00",
  exchangeRate: "1",
  supplyType: "inter",
  exportTax: null,
  placeOfSupply: "27",
  reverseCharge: false,
  clientName: "Acme",
  clientGstin: "27AABCA1111B1ZP",
  original: null,
  lines: [line()],
  ...over,
});

function sheet(sheets: ReturnType<typeof buildGstr1>, name: string) {
  const s = sheets.find((x) => x.name === name)!;
  return s.rows.map((r) => Object.fromEntries(s.columns.map((c, i) => [c, r[i]])));
}

describe("GSTR-1", () => {
  it("formats dates and places of supply like the offline tool", () => {
    expect(gstDate("2026-09-05")).toBe("05-Sep-2026");
    expect(posLabel("27")).toBe("27-Maharashtra");
    expect(posLabel("96")).toBe("96-Other Countries");
  });

  it("classifies B2B, B2CL, B2CS and exports", () => {
    const sheets = buildGstr1([
      doc({ number: "FL/26-27/0001" }),
      doc({ number: "FL/26-27/0002", clientGstin: "", total: "236000.00", lines: [line({ taxable: "200000.00", igst: "36000.00" })] }),
      doc({ number: "FL/26-27/0003", clientGstin: "", total: "11800.00", placeOfSupply: "29", supplyType: "intra", lines: [line({ igst: "0", cgst: "900", sgst: "900" })] }),
      doc({ number: "FL/26-27/0004", clientGstin: "", total: "11800.00" }),
      doc({ number: "FL/26-27/0005", clientGstin: "", supplyType: "export", exportTax: "lut", placeOfSupply: "96", total: "1000.00", exchangeRate: "83.5", lines: [line({ taxable: "1000.00", igst: "0" })] }),
      doc({ number: "FL/26-27/0006", status: "void" }),
    ]);
    expect(sheet(sheets, "b2b")).toEqual([
      expect.objectContaining({ "Invoice Number": "FL/26-27/0001", "Invoice Value": 11800, "Place Of Supply": "27-Maharashtra", "Invoice Type": "Regular B2B", Rate: 18, "Taxable Value": 10000 }),
    ]);
    expect(sheet(sheets, "b2cl")).toEqual([expect.objectContaining({ "Invoice Number": "FL/26-27/0002", "Taxable Value": 200000 })]);
    expect(sheet(sheets, "b2cs")).toEqual([
      expect.objectContaining({ "Place Of Supply": "27-Maharashtra", Rate: 18, "Taxable Value": 10000 }),
      expect.objectContaining({ "Place Of Supply": "29-Karnataka", Rate: 18, "Taxable Value": 10000 }),
    ]);
    expect(sheet(sheets, "exp")).toEqual([expect.objectContaining({ "Export Type": "WOPAY", "Invoice Value": 83500, "Taxable Value": 83500 })]);
    expect(sheet(sheets, "docs")).toEqual([
      { "Nature of Document": "Invoices for outward supply", "Sr. No. From": "FL/26-27/0001", "Sr. No. To": "FL/26-27/0006", "Total Number": 6, Cancelled: 1 },
    ]);
  });

  it("splits multi-rate invoices and reports SEZ types", () => {
    const sheets = buildGstr1([
      doc({ lines: [line(), line({ gstRate: "12", taxable: "500.00", igst: "60.00" }), line({ taxable: "250.00", igst: "45.00" })] }),
      doc({ number: "FL/26-27/0002", supplyType: "sez", exportTax: "lut", lines: [line({ igst: "0" })] }),
    ]);
    const b2b = sheet(sheets, "b2b");
    expect(b2b.filter((r) => r["Invoice Number"] === "FL/26-27/0001").map((r) => [r.Rate, r["Taxable Value"]])).toEqual([
      [18, 10250],
      [12, 500],
    ]);
    expect(b2b.find((r) => r["Invoice Number"] === "FL/26-27/0002")?.["Invoice Type"]).toBe("SEZ supplies without payment");
  });

  it("puts notes in CDNR/CDNUR and nets small B2C notes into B2CS", () => {
    const original = { total: "11800.00", exchangeRate: "1", supplyType: "inter" as const, clientGstin: "27AABCA1111B1ZP", exportTax: null };
    const sheets = buildGstr1([
      doc({ type: "credit_note", number: "FLCN/26-27/0001", total: "1180.00", original, lines: [line({ taxable: "1000.00", igst: "180.00" })] }),
      doc({ type: "debit_note", number: "FLDN/26-27/0001", clientGstin: "", total: "590.00", original: { ...original, clientGstin: "", total: "236000.00" }, lines: [line({ taxable: "500.00", igst: "90.00" })] }),
      doc({ number: "FL/26-27/0009", clientGstin: "", total: "11800.00" }),
      doc({ type: "credit_note", number: "FLCN/26-27/0002", clientGstin: "", total: "1180.00", original: { ...original, clientGstin: "" }, lines: [line({ taxable: "1000.00", igst: "180.00" })] }),
    ]);
    expect(sheet(sheets, "cdnr")).toEqual([expect.objectContaining({ "Note Number": "FLCN/26-27/0001", "Note Type": "C", "Note Value": 1180, "Taxable Value": 1000 })]);
    expect(sheet(sheets, "cdnur")).toEqual([expect.objectContaining({ "UR Type": "B2CL", "Note Type": "D", "Taxable Value": 500 })]);
    expect(sheet(sheets, "b2cs")).toEqual([expect.objectContaining({ "Taxable Value": 9000 })]);
    const hsnB2b = sheet(sheets, "hsn(b2b)");
    expect(hsnB2b).toEqual([expect.objectContaining({ HSN: "998314", "Taxable Value": -1000, "Integrated Tax Amount": -180 })]);
  });
});
