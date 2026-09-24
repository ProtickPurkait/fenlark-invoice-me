import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { SeriesForm } from "@/components/settings/series-form";
import { Alert } from "@/components/ui/card";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { numberCounters } from "@/lib/db/schema";
import { todayIST } from "@/lib/dates";
import { DOC_LABELS, DOCUMENT_TYPES } from "@/lib/documents/types";
import { counterPeriod } from "@/lib/numbering";
import { loadNumberSeries } from "@/lib/settings";

export const metadata: Metadata = { title: "Numbering" };

export default async function NumberingSettingsPage() {
  const user = await requireUser();
  const series = await loadNumberSeries();
  const today = todayIST();
  const nextByType = Object.fromEntries(
    await Promise.all(
      DOCUMENT_TYPES.map(async (type) => {
        const period = counterPeriod(today, series[type].resetYearly);
        const [row] = await db
          .select({ lastValue: numberCounters.lastValue })
          .from(numberCounters)
          .where(and(eq(numberCounters.docType, type), eq(numberCounters.period, period)));
        return [type, (row?.lastValue ?? 0) + 1] as const;
      }),
    ),
  );

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title="How numbering works">
        Numbers are assigned when a document is issued, never to drafts, so the series has no gaps. GST allows at most 16
        characters: letters, digits, “-” and “/”. Tokens: <code>{"{PREFIX}"}</code> <code>{"{FY}"}</code> (26-27){" "}
        <code>{"{FYLONG}"}</code> (2026-27) <code>{"{YYYY}"}</code> <code>{"{YY}"}</code> <code>{"{MM}"}</code>{" "}
        <code>{"{SEQ}"}</code>.
      </Alert>
      {DOCUMENT_TYPES.map((type) => (
        <SeriesForm
          key={type}
          title={DOC_LABELS[type].plural}
          canEdit={can(user.role, "settings:write")}
          currentNext={nextByType[type]}
          defaults={{
            docType: type,
            prefix: series[type].prefix,
            pattern: series[type].pattern,
            padding: series[type].padding,
            resetYearly: series[type].resetYearly,
          }}
        />
      ))}
    </div>
  );
}
