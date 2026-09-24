import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, type DbOrTx } from "@/lib/db";
import { businessSettings, numberSeries, type BusinessSettings, type NumberSeries } from "@/lib/db/schema";
import type { DocumentType, SellerSnapshot } from "@/lib/documents/types";
import { appUrl } from "@/lib/env";
import type { EmailBrand } from "@/emails/branded-email";

export const DEFAULT_SERIES: Record<DocumentType, { prefix: string; pattern: string; padding: number }> = {
  invoice: { prefix: "FL", pattern: "{PREFIX}/{FY}/{SEQ}", padding: 4 },
  quote: { prefix: "FLQ", pattern: "{PREFIX}/{FY}/{SEQ}", padding: 4 },
  credit_note: { prefix: "FLCN", pattern: "{PREFIX}/{FY}/{SEQ}", padding: 4 },
  debit_note: { prefix: "FLDN", pattern: "{PREFIX}/{FY}/{SEQ}", padding: 4 },
};

export async function loadSettings(conn: DbOrTx = db): Promise<BusinessSettings> {
  const [row] = await conn.select().from(businessSettings).where(eq(businessSettings.id, 1));
  if (row) return row;
  const [created] = await conn
    .insert(businessSettings)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await conn.select().from(businessSettings).where(eq(businessSettings.id, 1));
  return again;
}

/** Per-request cached settings for server components. */
export const getSettings = cache(() => loadSettings());

export async function loadNumberSeries(conn: DbOrTx = db): Promise<Record<DocumentType, NumberSeries>> {
  const rows = await conn.select().from(numberSeries);
  const byType = new Map(rows.map((r) => [r.docType, r]));
  const missing = (Object.keys(DEFAULT_SERIES) as DocumentType[]).filter((t) => !byType.has(t));
  if (missing.length) {
    const inserted = await conn
      .insert(numberSeries)
      .values(missing.map((docType) => ({ docType, ...DEFAULT_SERIES[docType], resetYearly: true })))
      .onConflictDoNothing()
      .returning();
    for (const r of inserted) byType.set(r.docType, r);
    if (inserted.length !== missing.length) {
      for (const r of await conn.select().from(numberSeries)) byType.set(r.docType, r);
    }
  }
  return Object.fromEntries(byType) as Record<DocumentType, NumberSeries>;
}

export function businessName(s: Pick<BusinessSettings, "tradeName" | "legalName">): string {
  return s.tradeName || s.legalName || "Fenlark";
}

export function isProfileComplete(s: BusinessSettings): boolean {
  if (!s.legalName || !s.addressLine1 || !s.stateCode) return false;
  if (s.gstRegistration !== "unregistered" && !s.gstin) return false;
  return true;
}

/** Relative URL for in-app use; emails need the absolute form from `emailBrand`. */
export function logoUrl(s: BusinessSettings): string | null {
  return s.logoPath ? `/brand/logo?v=${s.updatedAt.getTime()}` : null;
}

export function emailBrand(s: BusinessSettings): EmailBrand {
  const relative = logoUrl(s);
  return {
    name: businessName(s),
    color: s.brandColor || "#0f766e",
    logoUrl: relative ? appUrl(relative) : null,
    email: s.email,
    website: s.website,
  };
}

export function sellerSnapshot(s: BusinessSettings): SellerSnapshot {
  return {
    legalName: s.legalName,
    tradeName: s.tradeName,
    addressLine1: s.addressLine1,
    addressLine2: s.addressLine2,
    city: s.city,
    postalCode: s.postalCode,
    stateCode: s.stateCode,
    country: s.country,
    email: s.email,
    phone: s.phone,
    website: s.website,
    gstRegistration: s.gstRegistration,
    gstin: s.gstin,
    pan: s.pan,
    udyamNumber: s.udyamNumber,
    lutArn: s.lutArn,
    signatoryName: s.signatoryName,
    brandColor: s.brandColor,
    logoPath: s.logoPath,
    signaturePath: s.signaturePath,
    bankAccountName: s.bankAccountName,
    bankName: s.bankName,
    bankAccountNumber: s.bankAccountNumber,
    bankIfsc: s.bankIfsc,
    bankBranch: s.bankBranch,
    bankSwift: s.bankSwift,
    upiId: s.upiId,
    upiPayeeName: s.upiPayeeName,
  };
}
