import { describe, expect, it } from "vitest";
import {
  defaultPlaceOfSupply,
  determineSupplyType,
  gstinCheckDigit,
  isValidGstin,
  panFromGstin,
  taxSplit,
  zeroRatedDeclaration,
} from "@/lib/tax/gst";

// Valid GSTIN built from a sample PAN with a correct checksum.
const BASE = "29AAGCB1286Q1Z";
const GSTIN = BASE + gstinCheckDigit(BASE);

describe("GSTIN", () => {
  it("validates structure, state code and checksum", () => {
    expect(isValidGstin(GSTIN)).toBe(true);
    expect(isValidGstin(GSTIN.toLowerCase())).toBe(true);
    const wrongCheck = BASE + (GSTIN[14] === "A" ? "B" : "A");
    expect(isValidGstin(wrongCheck)).toBe(false);
    expect(isValidGstin("99AAGCB1286Q1Z" + gstinCheckDigit("99AAGCB1286Q1Z"))).toBe(false);
    expect(isValidGstin("")).toBe(false);
  });
  it("matches a known real-world checksum", () => {
    // Publicly listed GSTIN format example with verified check digit.
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
  });
  it("extracts the PAN", () => {
    expect(panFromGstin(GSTIN)).toBe("AAGCB1286Q");
  });
});

describe("supply type", () => {
  it("is intra-state when place of supply matches the seller state", () => {
    expect(determineSupplyType({ sellerStateCode: "29", placeOfSupply: "29", clientCountry: "IN", isSez: false })).toBe("intra");
    expect(determineSupplyType({ sellerStateCode: "29", placeOfSupply: "27", clientCountry: "IN", isSez: false })).toBe("inter");
  });
  it("treats SEZ as zero-rated even within the state", () => {
    expect(determineSupplyType({ sellerStateCode: "29", placeOfSupply: "29", clientCountry: "IN", isSez: true })).toBe("sez");
  });
  it("treats foreign clients as exports", () => {
    expect(determineSupplyType({ sellerStateCode: "29", placeOfSupply: "96", clientCountry: "US", isSez: false })).toBe("export");
    expect(defaultPlaceOfSupply({ country: "US" })).toBe("96");
    expect(defaultPlaceOfSupply({ country: "IN", gstin: GSTIN })).toBe("29");
  });
  it("picks tax heads", () => {
    expect(taxSplit(true, "intra", null)).toBe("cgst_sgst");
    expect(taxSplit(true, "inter", null)).toBe("igst");
    expect(taxSplit(true, "export", "lut")).toBe("none");
    expect(taxSplit(true, "export", "igst")).toBe("igst");
    expect(taxSplit(false, "intra", null)).toBe("none");
  });
  it("prints the LUT declaration", () => {
    expect(zeroRatedDeclaration("export", "lut", "AD290426000123X")).toContain("LETTER OF UNDERTAKING");
    expect(zeroRatedDeclaration("export", "lut", "AD290426000123X")).toContain("AD290426000123X");
    expect(zeroRatedDeclaration("sez", "igst")).toContain("ON PAYMENT OF INTEGRATED TAX");
    expect(zeroRatedDeclaration("intra", null)).toBeNull();
  });
});
