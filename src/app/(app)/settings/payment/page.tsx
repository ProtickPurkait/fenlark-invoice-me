import type { Metadata } from "next";
import { PaymentDetailsForm } from "@/components/settings/simple-forms";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Bank & UPI" };

export default async function PaymentSettingsPage() {
  const user = await requireUser();
  const s = await getSettings();
  return (
    <PaymentDetailsForm
      canEdit={can(user.role, "settings:write")}
      defaults={{
        bankAccountName: s.bankAccountName,
        bankName: s.bankName,
        bankAccountNumber: s.bankAccountNumber,
        bankIfsc: s.bankIfsc,
        bankBranch: s.bankBranch,
        bankSwift: s.bankSwift,
        upiId: s.upiId,
        upiPayeeName: s.upiPayeeName,
      }}
    />
  );
}
