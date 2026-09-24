import { desc, eq, sql } from "drizzle-orm";
import { Plus, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RecurringRowActions } from "@/components/recurring/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { calculateDocument } from "@/lib/calc/document";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { clients, documents, recurringProfiles } from "@/lib/db/schema";
import { RECURRING_FREQUENCIES } from "@/lib/documents/types";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Recurring invoices" };

export default async function RecurringPage() {
  const user = await requireUser();
  const rows = await db
    .select({
      profile: recurringProfiles,
      clientName: clients.name,
      invoices: sql<number>`(select count(*)::int from ${documents} where ${documents.recurringProfileId} = ${recurringProfiles.id})`,
    })
    .from(recurringProfiles)
    .innerJoin(clients, eq(clients.id, recurringProfiles.clientId))
    .orderBy(desc(recurringProfiles.createdAt));
  const canWrite = can(user.role, "documents:write");

  return (
    <>
      <PageHeader
        title="Recurring invoices"
        description="Retainers and subscriptions. The daily job creates (and optionally issues and emails) each invoice."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/recurring/new">
                <Plus /> New schedule
              </Link>
            </Button>
          ) : null
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Repeat />}
            title="No recurring invoices"
            description="Create a schedule from scratch, or open an invoice and choose “Make recurring”."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Schedule</TH>
                <TH>Client</TH>
                <TH>Repeats</TH>
                <TH>Next invoice</TH>
                <TH align="right">Amount</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {rows.map(({ profile: p, clientName, invoices }) => {
                const estimate = calculateDocument({ split: "igst", roundOff: false, lines: p.template.lines });
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/recurring/${p.id}`} className="font-medium text-zinc-900 hover:text-brand-700">
                        {p.name}
                      </Link>
                      <p className="text-xs text-zinc-500">
                        {invoices} invoice{invoices === 1 ? "" : "s"} created
                        {p.maxOccurrences ? ` of ${p.maxOccurrences}` : ""}
                        {p.autoSend ? " · auto-emailed" : p.autoIssue ? " · auto-issued" : " · saved as drafts"}
                      </p>
                    </TD>
                    <TD className="text-zinc-700">{clientName}</TD>
                    <TD className="text-zinc-600">{RECURRING_FREQUENCIES.find((f) => f.value === p.frequency)?.label}</TD>
                    <TD>
                      {p.status === "active" ? (
                        <span className="text-zinc-800">{formatDate(p.nextRunDate)}</span>
                      ) : (
                        <Badge tone={p.status === "paused" ? "warning" : "muted"}>{p.status === "paused" ? "Paused" : "Ended"}</Badge>
                      )}
                    </TD>
                    <TD align="right" className="whitespace-nowrap">
                      {formatMoney(estimate.taxableTotal, p.template.currency)}
                      <span className="block text-xs text-zinc-400">+ tax</span>
                    </TD>
                    <TD align="right">{canWrite ? <RecurringRowActions id={p.id} status={p.status} /> : null}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
