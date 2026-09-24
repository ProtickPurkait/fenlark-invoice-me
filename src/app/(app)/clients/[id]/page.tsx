import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { FileCheck, FileText, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ClientArchiveButton } from "@/components/clients/client-archive";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getClient } from "@/lib/clients/queries";
import { countryName } from "@/lib/countries";
import { financialYear, formatDate, todayIST } from "@/lib/dates";
import { db } from "@/lib/db";
import { documents, payments } from "@/lib/db/schema";
import { DOC_LABELS, displayStatus, documentPath } from "@/lib/documents/types";
import { formatMoney } from "@/lib/money";
import { stateName } from "@/lib/tax/gst";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage(props: PageProps<"/clients/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const client = z.uuid().safeParse(id).success ? await getClient(id) : null;
  if (!client) notFound();
  const today = todayIST();
  const fy = financialYear(today);

  const [docs, [stats], [received]] = await Promise.all([
    db.select().from(documents).where(eq(documents.clientId, id)).orderBy(desc(documents.issueDate), desc(documents.createdAt)).limit(100),
    db
      .select({
        outstanding: sql<string>`coalesce(sum(${documents.balanceDue} * ${documents.exchangeRate}) filter (where ${documents.status} in ('issued','partially_paid')), 0)`,
        overdue: sql<string>`coalesce(sum(${documents.balanceDue} * ${documents.exchangeRate}) filter (where ${documents.status} in ('issued','partially_paid') and ${documents.dueDate} < ${today}), 0)`,
        invoicedFy: sql<string>`coalesce(sum(${documents.total} * ${documents.exchangeRate}) filter (where ${documents.issueDate} >= ${fy.start}), 0)`,
      })
      .from(documents)
      .where(and(eq(documents.clientId, id), eq(documents.type, "invoice"), ne(documents.status, "draft"), ne(documents.status, "void"))),
    db
      .select({
        amount: sql<string>`coalesce(sum(case when ${payments.kind} = 'refund' then -${payments.amount} else ${payments.amount} end * ${documents.exchangeRate}), 0)`,
        tds: sql<string>`coalesce(sum(${payments.tdsAmount} * ${documents.exchangeRate}), 0)`,
      })
      .from(payments)
      .innerJoin(documents, eq(documents.id, payments.documentId))
      .where(and(eq(documents.clientId, id), gte(payments.date, fy.start), lt(payments.date, `${fy.startYear + 1}-04-01`))),
  ]);
  const canWrite = can(user.role, "documents:write");

  return (
    <>
      <PageHeader
        back={
          <Link href="/clients" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Clients
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {client.name}
            {client.archivedAt ? <Badge tone="muted">Archived</Badge> : null}
            {client.isSez ? <Badge tone="info">SEZ</Badge> : null}
          </span>
        }
        description={[client.gstin && `GSTIN ${client.gstin}`, client.email, client.phone].filter(Boolean).join(" · ")}
        actions={
          <>
            {can(user.role, "clients:write") ? (
              <>
                <ClientArchiveButton id={client.id} archived={Boolean(client.archivedAt)} />
                <Button variant="outline" asChild>
                  <Link href={`/clients/${client.id}/edit`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
              </>
            ) : null}
            {canWrite && !client.archivedAt ? (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/quotes/new?client=${client.id}`}>
                    <FileCheck /> New quote
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/invoices/new?client=${client.id}`}>
                    <FileText /> New invoice
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Outstanding" value={formatMoney(stats.outstanding)} />
        <Stat label="Overdue" value={formatMoney(stats.overdue)} tone={Number(stats.overdue) > 0 ? "danger" : undefined} />
        <Stat label={`Invoiced FY ${fy.long}`} value={formatMoney(stats.invoicedFy)} />
        <Stat label={`Received FY ${fy.long}`} value={formatMoney(received.amount)} hint={Number(received.tds) > 0 ? `+ ${formatMoney(received.tds)} TDS` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Documents" />
          {docs.length === 0 ? (
            <EmptyState icon={<FileText />} title="Nothing yet" description="Invoices, quotes and notes for this client will show here." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Document</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {docs.map((d) => {
                  const s = displayStatus(d, today);
                  return (
                    <TR key={d.id}>
                      <TD>
                        <Link href={documentPath(d.type, d.id)} className="font-medium text-zinc-900 hover:text-brand-700">
                          {DOC_LABELS[d.type].singular} {d.number ?? "(draft)"}
                        </Link>
                      </TD>
                      <TD className="text-zinc-600">{formatDate(d.issueDate)}</TD>
                      <TD>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </TD>
                      <TD align="right">{formatMoney(d.total, d.currency)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <Detail label="Contact">{[client.contactName, client.email, ...client.ccEmails].filter(Boolean).join(", ") || "—"}</Detail>
              <Detail label="Address">
                {[client.addressLine1, client.addressLine2, [client.city, client.postalCode].filter(Boolean).join(" "), client.country === "IN" ? stateName(client.stateCode) : countryName(client.country)]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </Detail>
              {client.pan ? <Detail label="PAN">{client.pan}</Detail> : null}
              <Detail label="Billing">
                {client.currency}
                {client.paymentTermsDays !== null ? ` · Net ${client.paymentTermsDays}` : ""}
                {client.tdsApplicable ? ` · TDS ${Number(client.tdsRate ?? 0)}%${client.tdsSection ? ` (${client.tdsSection})` : ""}` : ""}
              </Detail>
              <Detail label="Automation">
                Reminders {client.remindersEnabled ? "on" : "off"} · Portal {client.portalEnabled ? "on" : "off"}
              </Detail>
            </CardBody>
          </Card>
          {client.notes ? (
            <Alert tone="info" title="Internal notes">
              <span className="whitespace-pre-line">{client.notes}</span>
            </Alert>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular ${tone === "danger" ? "text-red-600" : "text-zinc-900"}`}>{value}</p>
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="text-zinc-800">{children}</p>
    </div>
  );
}
