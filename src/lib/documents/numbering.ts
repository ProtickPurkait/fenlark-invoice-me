import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type DbOrTx, type Tx } from "@/lib/db";
import { numberCounters } from "@/lib/db/schema";
import { UserError } from "@/lib/errors";
import { checkDocumentNumber, counterPeriod, formatDocumentNumber } from "@/lib/numbering";
import { loadNumberSeries } from "@/lib/settings";
import type { DocumentType } from "./types";

/**
 * Allocates the next number inside the caller's transaction. The upsert takes
 * a row lock on the counter, so concurrent issues serialize, and a rollback
 * releases the number — no gaps, as GST requires consecutive serials.
 */
export async function allocateNumber(tx: Tx, docType: DocumentType, issueDate: string): Promise<{ number: string; sequence: number }> {
  const series = (await loadNumberSeries(tx))[docType];
  const period = counterPeriod(issueDate, series.resetYearly);
  const [row] = await tx
    .insert(numberCounters)
    .values({ docType, period, lastValue: 1 })
    .onConflictDoUpdate({
      target: [numberCounters.docType, numberCounters.period],
      set: { lastValue: sql`${numberCounters.lastValue} + 1` },
    })
    .returning({ lastValue: numberCounters.lastValue });
  const number = formatDocumentNumber({
    pattern: series.pattern,
    prefix: series.prefix,
    padding: series.padding,
    sequence: row.lastValue,
    date: issueDate,
  });
  const check = checkDocumentNumber(number);
  if (!check.ok) throw new UserError(`Can't issue: ${check.error}. Adjust the numbering in Settings → Numbering.`);
  return { number, sequence: row.lastValue };
}

export async function previewNextNumber(docType: DocumentType, issueDate: string, conn: DbOrTx = db): Promise<string> {
  const series = (await loadNumberSeries(conn))[docType];
  const period = counterPeriod(issueDate, series.resetYearly);
  const [row] = await conn
    .select({ lastValue: numberCounters.lastValue })
    .from(numberCounters)
    .where(and(eq(numberCounters.docType, docType), eq(numberCounters.period, period)));
  return formatDocumentNumber({
    pattern: series.pattern,
    prefix: series.prefix,
    padding: series.padding,
    sequence: (row?.lastValue ?? 0) + 1,
    date: issueDate,
  });
}
