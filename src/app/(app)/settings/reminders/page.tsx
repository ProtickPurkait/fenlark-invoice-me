import type { Metadata } from "next";
import { RemindersForm } from "@/components/settings/simple-forms";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { isEmailConfigured } from "@/lib/email/send";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Reminders & email" };

export default async function RemindersSettingsPage() {
  const user = await requireUser();
  const s = await getSettings();
  return (
    <RemindersForm
      canEdit={can(user.role, "settings:write")}
      emailConfigured={isEmailConfigured()}
      defaults={{
        remindersEnabled: s.remindersEnabled,
        reminderOffsets: s.reminderOffsets,
        sendPaymentReceipts: s.sendPaymentReceipts,
        bccEmail: s.bccEmail,
      }}
    />
  );
}
