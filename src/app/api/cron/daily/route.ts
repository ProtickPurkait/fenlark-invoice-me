import { purgeExpiredAuthRows } from "@/lib/auth/service";
import { safeEqual } from "@/lib/crypto";
import { todayIST } from "@/lib/dates";
import { env } from "@/lib/env";
import { runDueProfiles } from "@/lib/recurring/service";
import { runReminders } from "@/lib/reminders";

// Recurring invoices render PDFs and send email. 60s is the Hobby-plan ceiling
// without Fluid compute and plenty for a small business's daily volume.
export const maxDuration = 60;

/**
 * Daily job (Vercel Cron, see vercel.json): recurring invoices, then payment
 * reminders, then housekeeping. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = env().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayIST();
  const recurring = await runDueProfiles(today);
  const reminders = await runReminders(today);
  await purgeExpiredAuthRows();

  return Response.json({
    today,
    recurring,
    reminders: {
      sent: reminders.filter((r) => r.status === "sent").length,
      skipped: reminders.filter((r) => r.status === "skipped").length,
      failed: reminders.filter((r) => r.status === "failed"),
    },
  });
}
