import { eq } from "drizzle-orm";
import type { Actor } from "@/lib/activity";
import { db } from "@/lib/db";
import { businessSettings, clients, users, type Client } from "@/lib/db/schema";
import { gstinCheckDigit } from "@/lib/tax/gst";
import { loadSettings } from "@/lib/settings";
import type { DocumentInputValues } from "@/lib/validation/document";

export function gstin(state: string, pan: string, entity = "1"): string {
  const first14 = `${state}${pan}${entity}Z`;
  return first14 + gstinCheckDigit(first14);
}

export const SELLER_GSTIN = gstin("29", "AAGCF1234K");

export async function seedBusiness(over: Partial<typeof businessSettings.$inferInsert> = {}) {
  await loadSettings();
  await db
    .update(businessSettings)
    .set({
      legalName: "Fenlark Technologies Private Limited",
      tradeName: "Fenlark",
      addressLine1: "12, 5th Cross, Indiranagar",
      city: "Bengaluru",
      postalCode: "560038",
      stateCode: "29",
      gstRegistration: "regular",
      gstin: SELLER_GSTIN,
      pan: "AAGCF1234K",
      email: "billing@fenlark.in",
      lutArn: "AD290426000123X",
      upiId: "fenlark@okhdfcbank",
      upiPayeeName: "Fenlark Technologies",
      ...over,
    })
    .where(eq(businessSettings.id, 1));
  return loadSettings();
}

export async function seedUser(): Promise<Actor & { id: string }> {
  const [u] = await db.insert(users).values({ email: "owner@fenlark.in", name: "Owner", role: "owner" }).returning();
  return { type: "user", id: u.id, label: "Owner" };
}

export async function seedClient(over: Partial<typeof clients.$inferInsert> = {}): Promise<Client> {
  const [c] = await db
    .insert(clients)
    .values({
      name: "Acme Retail Pvt Ltd",
      email: "ap@acme.test",
      stateCode: "29",
      gstin: gstin("29", "AABCA1111B"),
      country: "IN",
      ...over,
    })
    .returning();
  return c;
}

export function draftInput(clientId: string, over: Partial<DocumentInputValues> = {}): DocumentInputValues {
  return {
    type: "invoice",
    clientId,
    issueDate: "2026-09-24",
    dueDate: null,
    validUntil: null,
    currency: "INR",
    exchangeRate: "1",
    placeOfSupply: "29",
    exportTax: null,
    reverseCharge: false,
    reference: "",
    subject: "",
    notes: "",
    terms: "",
    relatedDocumentId: null,
    noteReason: null,
    lines: [
      {
        itemId: null,
        name: "Website design",
        description: "",
        hsnSac: "998314",
        quantity: "1",
        unit: "OTH",
        rate: "10000",
        discountType: "percent",
        discountValue: "0",
        gstRate: "18",
      },
    ],
    ...over,
  };
}
