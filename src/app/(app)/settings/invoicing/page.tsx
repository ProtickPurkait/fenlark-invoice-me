import type { Metadata } from "next";
import { InvoiceDefaultsForm } from "@/components/settings/simple-forms";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Invoice defaults" };

export default async function InvoicingSettingsPage() {
  const user = await requireUser();
  const s = await getSettings();
  return (
    <InvoiceDefaultsForm
      canEdit={can(user.role, "settings:write")}
      defaults={{
        defaultCurrency: s.defaultCurrency,
        paymentTermsDays: s.paymentTermsDays,
        quoteValidityDays: s.quoteValidityDays,
        roundOff: s.roundOff,
        invoiceNotes: s.invoiceNotes,
        invoiceTerms: s.invoiceTerms,
        quoteTerms: s.quoteTerms,
      }}
    />
  );
}
