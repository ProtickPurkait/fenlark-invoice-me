import { describe, expect, it } from "vitest";
import { amountInWords } from "@/lib/amount-in-words";
import { decryptSecret, encryptSecret, hmacSha256Hex } from "@/lib/crypto";
import { addDays, daysBetween, financialYear, formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { isValidUpiId, upiUri } from "@/lib/upi";

describe("amountInWords", () => {
  it("uses lakh / crore for INR", () => {
    expect(amountInWords("123456.50")).toBe("Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only");
    expect(amountInWords("10000000")).toBe("Rupees One Crore Only");
  });
  it("uses million for other currencies", () => {
    expect(amountInWords("1250000.05", "USD")).toBe("US Dollars One Million Two Hundred Fifty Thousand and Five Cents Only");
  });
});

describe("money formatting", () => {
  it("groups INR the Indian way", () => {
    expect(formatMoney("12345678.5")).toBe("₹1,23,45,678.50");
  });
});

describe("dates", () => {
  it("computes financial years and day arithmetic", () => {
    expect(financialYear("2027-01-15").long).toBe("2026-27");
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetween("2026-09-24", "2026-10-09")).toBe(15);
    expect(formatDate("2026-09-24")).toMatch(/24 Sept? 2026/);
  });
});

describe("UPI", () => {
  it("builds a pay link with amount and note", () => {
    const uri = upiUri({ upiId: "fenlark@okhdfcbank", payeeName: "Fenlark Labs", amount: "11800", note: "Invoice FL/26-27/0001" });
    expect(uri).toBe("upi://pay?pa=fenlark%40okhdfcbank&pn=Fenlark%20Labs&am=11800.00&cu=INR&tn=Invoice%20FL%2F26-27%2F0001");
  });
  it("validates VPAs", () => {
    expect(isValidUpiId("name.surname@okaxis")).toBe(true);
    expect(isValidUpiId("not a vpa")).toBe(false);
  });
});

describe("crypto", () => {
  const key = Buffer.alloc(32, 1).toString("base64");
  it("round-trips AES-GCM secrets", () => {
    const sealed = encryptSecret('{"secret":"shh"}', key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptSecret(sealed, key)).toBe('{"secret":"shh"}');
  });
  it("rejects tampering and wrong keys", () => {
    const sealed = encryptSecret("x", key);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("y").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(sealed, Buffer.alloc(32, 2).toString("base64"))).toThrow();
  });
  it("computes HMACs", () => {
    expect(hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog")).toBe(
      "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });
});
