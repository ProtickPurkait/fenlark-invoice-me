import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pagination, SearchInput } from "@/components/app/list-controls";
import { DateRangeFilter } from "@/components/app/date-range";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { formatDate, isValidDateString } from "@/lib/dates";
import { db } from "@/lib/db";
import { clients, documents, payments } from "@/lib/db/schema";
import { paymentMethodLabel } from "@/lib/documents/types";
import { dec, formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Payments" };

const PAGE_SIZE = 50;

export default async function PaymentsPage(props: PageProps<"/payments">) {
  await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const from = typeof sp.from === "string" && isValidDateString(sp.from) ? sp.from : null;
  const to = typeof sp.to === "string" && isValidDateString(sp.to) ? sp.to : null;
  const page = Number(sp.page) || 1;
  const where = and(
    from ? gte(payments.date, from) : undefined,
    to ? lte(payments.date, to) : undefined,
    q ? or(ilike(clients.name, `%${q}%`), ilike(documents.number, `%${q}%`), ilike(payments.reference, `%${q}%`)) : undefined,
  );

  const [rows, [totals]] = await Promise.all([
    db
      .select({ payment: payments, number: documents.number, currency: documents.currency, clientName: clients.name, clientId: clients.id })
      .from(payments)
      .innerJoin(documents, eq(documents.id, payments.documentId))
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .where(where)
      .orderBy(desc(payments.date), desc(payments.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({
        n: sql<number>`count(*)::int`,
        received: sql<string>`coalesce(sum(case when ${payments.kind} = 'refund' then -${payments.amount} else ${payments.amount} end * ${documents.exchangeRate}), 0)`,
        tds: sql<string>`coalesce(sum(${payments.tdsAmount} * ${documents.exchangeRate}), 0)`,
      })
      .from(payments)
      .innerJoin(documents, eq(documents.id, payments.documentId))
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .where(where),
  ]);

  return (
    <>
      <PageHeader
        title="Payments"
        description={
          <>
            {totals.n} payment{totals.n === 1 ? "" : "s"} · {formatMoney(totals.received)} received
            {dec(totals.tds).greaterThan(0) ? ` · ${formatMoney(totals.tds)} TDS` : ""} (in INR)
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="Search client, invoice, reference…" className="lg:w-80" />
        <DateRangeFilter from={from} to={to} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Wallet />} title="No payments" description="Payments you record on invoices — and online payments — appear here." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Client</TH>
                  <TH>Invoice</TH>
                  <TH>Method</TH>
                  <TH align="right">Amount</TH>
                  <TH align="right">TDS</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map(({ payment: p, number, currency, clientName, clientId }) => (
                  <TR key={p.id}>
                    <TD className="whitespace-nowrap text-zinc-600">{formatDate(p.date)}</TD>
                    <TD>
                      <Link href={`/clients/${clientId}`} className="text-zinc-800 hover:text-brand-700">
                        {clientName}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/invoices/${p.documentId}`} className="font-medium text-zinc-900 hover:text-brand-700">
                        {number}
                      </Link>
                    </TD>
                    <TD className="text-zinc-600">
                      {p.gateway ? `Online · ${p.gateway}` : paymentMethodLabel(p.method)}
                      {p.reference ? <span className="block text-xs text-zinc-400">{p.reference}</span> : null}
                    </TD>
                    <TD align="right" className="whitespace-nowrap font-medium">
                      {p.kind === "refund" ? <Badge tone="warning" className="mr-2">Refund</Badge> : null}
                      {formatMoney(p.kind === "refund" ? dec(p.amount).negated().toFixed(2) : p.amount, currency)}
                    </TD>
                    <TD align="right" className="whitespace-nowrap text-zinc-600">
                      {dec(p.tdsAmount).greaterThan(0) ? formatMoney(p.tdsAmount, currency) : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={totals.n} />
          </>
        )}
      </Card>
    </>
  );
}
