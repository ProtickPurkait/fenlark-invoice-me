import { describe, expect, it } from "vitest";
import { checkDocumentNumber, checkSeriesPattern, counterPeriod, formatDocumentNumber } from "@/lib/numbering";

describe("formatDocumentNumber", () => {
  it("formats the default FY pattern", () => {
    expect(formatDocumentNumber({ pattern: "{PREFIX}/{FY}/{SEQ}", prefix: "FL", padding: 4, sequence: 7, date: "2026-09-24" })).toBe(
      "FL/26-27/0007",
    );
  });
  it("uses the previous FY for January–March", () => {
    expect(formatDocumentNumber({ pattern: "{PREFIX}/{FY}/{SEQ}", prefix: "FL", padding: 3, sequence: 12, date: "2027-03-31" })).toBe(
      "FL/26-27/012",
    );
    expect(formatDocumentNumber({ pattern: "{PREFIX}-{FYLONG}-{SEQ}", prefix: "X", padding: 1, sequence: 5, date: "2027-04-01" })).toBe(
      "X-2027-28-5",
    );
  });
  it("supports calendar tokens", () => {
    expect(formatDocumentNumber({ pattern: "INV{YY}{MM}-{SEQ}", prefix: "", padding: 3, sequence: 42, date: "2026-11-05" })).toBe(
      "INV2611-042",
    );
  });
  it("does not truncate sequences longer than the padding", () => {
    expect(formatDocumentNumber({ pattern: "{SEQ}", prefix: "", padding: 2, sequence: 12345, date: "2026-11-05" })).toBe("12345");
  });
});

describe("GST number rules", () => {
  it("accepts up to 16 characters of letters, digits, - and /", () => {
    expect(checkDocumentNumber("FLCN/26-27/0001").ok).toBe(true);
    expect(checkDocumentNumber("FLCN/2026-27/0001").ok).toBe(false);
    expect(checkDocumentNumber("FL_26_0001").ok).toBe(false);
  });
  it("validates patterns with a worst-case sample", () => {
    expect(checkSeriesPattern("{PREFIX}/{FY}/{SEQ}", "FL", 4).ok).toBe(true);
    expect(checkSeriesPattern("{PREFIX}/{FYLONG}/{SEQ}", "FLCN", 4).ok).toBe(false);
    expect(checkSeriesPattern("{PREFIX}/{FY}", "FL", 4).ok).toBe(false);
    expect(checkSeriesPattern("{PREFIX}/{BAD}/{SEQ}", "FL", 4).ok).toBe(false);
  });
  it("buckets counters by financial year", () => {
    expect(counterPeriod("2026-04-01", true)).toBe("26-27");
    expect(counterPeriod("2026-03-31", true)).toBe("25-26");
    expect(counterPeriod("2026-03-31", false)).toBe("all");
  });
});
