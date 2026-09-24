import type { GstRegistration } from "@/lib/documents/types";
import { determineSupplyType, taxSplit, type ExportTax, type SupplyType, type TaxSplit } from "@/lib/tax/gst";

export interface TaxContextInput {
  registration: GstRegistration;
  sellerStateCode: string;
  placeOfSupply: string | null;
  clientCountry: string;
  isSez: boolean;
  exportTax: ExportTax | null;
}

export interface TaxContext {
  supplyType: SupplyType;
  /** Only set for zero-rated supplies (export / SEZ). */
  exportTax: ExportTax | null;
  split: TaxSplit;
  /** GST is charged at all (regular registrants only). */
  gstEnabled: boolean;
}

/** Shared by the editor (live preview) and the server (authoritative). */
export function taxContext(input: TaxContextInput): TaxContext {
  const supplyType = determineSupplyType({
    sellerStateCode: input.sellerStateCode,
    placeOfSupply: input.placeOfSupply,
    clientCountry: input.clientCountry,
    isSez: input.isSez,
  });
  const zeroRated = supplyType === "export" || supplyType === "sez";
  const exportTax = zeroRated ? (input.exportTax ?? "lut") : null;
  const gstEnabled = input.registration === "regular";
  return { supplyType, exportTax, split: taxSplit(gstEnabled, supplyType, exportTax), gstEnabled };
}

export function supplyTypeLabel(ctx: Pick<TaxContext, "supplyType" | "exportTax" | "split" | "gstEnabled">): string {
  if (!ctx.gstEnabled) return "No GST (not a regular GST registrant)";
  switch (ctx.supplyType) {
    case "intra":
      return "Intra-state supply · CGST + SGST";
    case "inter":
      return "Inter-state supply · IGST";
    case "export":
      return ctx.exportTax === "igst" ? "Export · IGST paid (claim refund)" : "Export · zero-rated under LUT";
    case "sez":
      return ctx.exportTax === "igst" ? "SEZ supply · IGST paid" : "SEZ supply · zero-rated under LUT";
  }
}
