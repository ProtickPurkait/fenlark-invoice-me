import type { Client } from "@/lib/db/schema";
import type { ClientInput } from "@/lib/validation/catalog";

/** Form values for a client (shared by server pages and client components). */
export function clientDefaults(c: Client | null, defaults: { currency: string }): ClientInput {
  return {
    kind: c?.kind ?? "business",
    name: c?.name ?? "",
    contactName: c?.contactName ?? "",
    email: c?.email ?? "",
    ccEmails: c?.ccEmails.join(", ") ?? "",
    phone: c?.phone ?? "",
    gstin: c?.gstin ?? "",
    pan: c?.pan ?? "",
    isSez: c?.isSez ?? false,
    addressLine1: c?.addressLine1 ?? "",
    addressLine2: c?.addressLine2 ?? "",
    city: c?.city ?? "",
    postalCode: c?.postalCode ?? "",
    stateCode: c?.stateCode ?? "",
    country: c?.country ?? "IN",
    shippingAddress: c?.shippingAddress ?? "",
    currency: c?.currency ?? defaults.currency,
    paymentTermsDays: c?.paymentTermsDays ?? "",
    tdsApplicable: c?.tdsApplicable ?? false,
    tdsRate: c?.tdsRate ?? "",
    tdsSection: c?.tdsSection ?? "",
    tan: c?.tan ?? "",
    remindersEnabled: c?.remindersEnabled ?? true,
    portalEnabled: c?.portalEnabled ?? true,
    notes: c?.notes ?? "",
  };
}
