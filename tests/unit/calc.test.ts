import { describe, expect, it } from "vitest";
import { calculateDocument, calculateLine, invoiceBalance, toInr } from "@/lib/calc/document";

const line = (over: Partial<Parameters<typeof calculateLine>[0]> = {}) => ({
  quantity: "1",
  rate: "1000",
  discountType: "percent" as const,
  discountValue: "0",
  gstRate: "18",
  ...over,
});

describe("calculateLine", () => {
  it("splits intra-state GST into equal CGST and SGST", () => {
    const r = calculateLine(line({ quantity: "3", rate: "333.33" }), "cgst_sgst");
    expect(r.gross).toBe("999.99");
    expect(r.cgst).toBe("90.00");
    expect(r.sgst).toBe("90.00");
    expect(r.igst).toBe("0.00");
    expect(r.cgstRate).toBe("9");
    expect(r.total).toBe("1179.99");
  });

  it("charges IGST inter-state", () => {
    const r = calculateLine(line({ rate: "2500" }), "igst");
    expect(r.igst).toBe("450.00");
    expect(r.cgst).toBe("0.00");
    expect(r.total).toBe("2950.00");
  });

  it("charges no tax for exports under LUT / unregistered sellers", () => {
    const r = calculateLine(line({ rate: "2500" }), "none");
    expect(r.tax).toBe("0.00");
    expect(r.gstRate).toBe("0");
    expect(r.total).toBe("2500.00");
  });

  it("applies percentage and flat discounts before tax", () => {
    expect(calculateLine(line({ discountType: "percent", discountValue: "10" }), "igst")).toMatchObject({
      discount: "100.00",
      taxable: "900.00",
      igst: "162.00",
    });
    expect(calculateLine(line({ discountType: "amount", discountValue: "250" }), "igst")).toMatchObject({
      discount: "250.00",
      taxable: "750.00",
    });
  });

  it("caps discounts at the line amount", () => {
    expect(calculateLine(line({ discountType: "percent", discountValue: "150" }), "igst").taxable).toBe("0.00");
    expect(calculateLine(line({ discountType: "amount", discountValue: "5000" }), "igst").taxable).toBe("0.00");
  });

  it("handles fractional quantities and half-rupee rounding", () => {
    const r = calculateLine(line({ quantity: "2.5", rate: "99.99", gstRate: "5" }), "cgst_sgst");
    expect(r.gross).toBe("249.98"); // 249.975 rounds half up
    expect(r.cgst).toBe("6.25"); // 249.98 × 2.5% = 6.2495
    expect(r.cgstRate).toBe("2.5");
  });
});

describe("calculateDocument", () => {
  it("totals lines, rounds off and builds an HSN summary", () => {
    const r = calculateDocument({
      split: "cgst_sgst",
      roundOff: true,
      lines: [
        line({ rate: "1234.50", hsnSac: "998314", unit: "OTH" }),
        line({ rate: "100.10", quantity: "2", hsnSac: "998314", unit: "OTH" }),
        line({ rate: "500", gstRate: "12", hsnSac: "4901", unit: "NOS" }),
      ],
    });
    expect(r.subtotal).toBe("1934.70");
    expect(r.taxableTotal).toBe("1934.70");
    // 1234.50×9% = 111.105→111.11 ; 200.20×9% = 18.018→18.02 ; 500×6% = 30
    expect(r.cgstTotal).toBe("159.13");
    expect(r.sgstTotal).toBe("159.13");
    expect(r.taxTotal).toBe("318.26");
    expect(r.total).toBe("2253.00");
    expect(r.roundOff).toBe("0.04");
    expect(r.taxSummary).toHaveLength(2);
    expect(r.taxSummary[0]).toMatchObject({ hsnSac: "998314", gstRate: "18", taxable: "1434.70", quantity: "3", unit: "OTH" });
  });

  it("excludes tax from the payable total under reverse charge", () => {
    const r = calculateDocument({ split: "igst", roundOff: false, reverseCharge: true, lines: [line()] });
    expect(r.taxTotal).toBe("180.00");
    expect(r.total).toBe("1000.00");
  });

  it("does not round when disabled", () => {
    const r = calculateDocument({ split: "igst", roundOff: false, lines: [line({ rate: "10.55" })] });
    expect(r.total).toBe("12.45");
    expect(r.roundOff).toBe("0.00");
  });

  it("returns zeros for an empty document", () => {
    const r = calculateDocument({ split: "igst", roundOff: true, lines: [] });
    expect(r.total).toBe("0.00");
    expect(r.taxSummary).toEqual([]);
  });
});

describe("invoiceBalance", () => {
  it("nets payments, TDS, credit and debit notes", () => {
    expect(invoiceBalance({ total: "11800", debited: "500", credited: "1000", paid: "9000", tds: "1000" }).toFixed(2)).toBe("1300.00");
  });
  it("goes negative when overpaid", () => {
    expect(invoiceBalance({ total: "100", debited: "0", credited: "0", paid: "150", tds: "0" }).toFixed(2)).toBe("-50.00");
  });
});

it("converts to INR", () => {
  expect(toInr("1234.56", "83.123456")).toBe("102620.89");
});
