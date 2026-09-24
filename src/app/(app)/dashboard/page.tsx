import { CircleCheck, Circle, FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RevenueChart } from "@/components/app/revenue-chart";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, todayIST } from "@/lib/dates";
import { profileProblems } from "@/lib/documents/service";
import { isEmailConfigured } from "@/lib/email/send";
import { formatMoney } from "@/lib/money";
import { AGING_BUCKETS, dashboardData } from "@/lib/reports/queries";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const today = todayIST();
  const d = await dashboardData(today);
  const canWrite = can(user.role, "documents:write");

  const setup = [
    { done: profileProblems(settings).length === 0, label: "Complete your business profile (legal name, address, GSTIN)", href: "/settings/business" },
    { done: Boolean(settings.bankAccountNumber || settings.upiId), label: "Add bank account or UPI ID for payments", href: "/settings/payment" },
    { done: isEmailConfigured(), label: "Connect email sending (RESEND_API_KEY)", href: "/settings/reminders" },
    { done: d.counts.clients > 0, label: "Add your first client", href: "/clients/new" },
    { done: d.counts.invoices > 0, label: "Issue your first invoice", href: "/invoices/new" },
  ];
  const setupLeft = setup.filter((s) => !s.done).length;

  return (
    <>
      <PageHeader
        title={`Hello${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description={`FY ${d.fy.long} at a glance`}
        actions={
          canWrite ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/quotes/new">New quote</Link>
              </Button>
              <Button asChild>
                <Link href="/invoices/new">
                  <Plus /> New invoice
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      {setupLeft > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Get set up" description={`${setup.length - setupLeft} of ${setup.length} done`} />
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {setup.map((s) => (
              <Link key={s.label} href={s.href} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50">
                {s.done ? <CircleCheck className="size-4 text-emerald-600" /> : <Circle className="size-4 text-zinc-300" />}
                <span className={s.done ? "text-zinc-400 line-through" : "text-zinc-800"}>{s.label}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Outstanding" value={formatMoney(d.outstanding)} href="/invoices?status=unpaid" />
        <Kpi
          label="Overdue"
          value={formatMoney(d.overdue)}
          hint={d.overdueClients ? `${d.overdueClients} client${d.overdueClients === 1 ? "" : "s"}` : "Nothing overdue"}
          tone={d.overdue > 0 ? "danger" : undefined}
          href="/invoices?status=overdue"
        />
        <Kpi label="Received this month" value={formatMoney(d.receivedMonth)} hint={`${formatMoney(d.receivedFy)} this FY`} href="/payments" />
        <Kpi label={`Sales FY ${d.fy.long}`} value={formatMoney(d.salesFy)} hint={`+ ${formatMoney(d.taxFy)} GST`} href="/reports" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Last 12 months" description="Invoiced vs received, in INR" />
          <CardBody>
            <RevenueChart data={d.months} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Receivables" description="By days overdue" />
          <CardBody className="flex flex-col gap-3">
            {AGING_BUCKETS.map((label, i) => {
              const max = Math.max(...d.buckets, 1);
              return (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-zinc-600">{label}</span>
                    <span className="tabular font-medium text-zinc-900">{formatMoney(d.buckets[i])}</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100">
                    <div className={`h-2 rounded-full ${i === 0 ? "bg-brand-500" : i < 3 ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${(d.buckets[i] / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Who owes you" />
          <CardBody className="flex flex-col gap-2 text-sm">
            {d.topDebtors.length === 0 ? <p className="text-zinc-500">All caught up.</p> : null}
            {d.topDebtors.map((c) => (
              <Link key={c.clientId} href={`/clients/${c.clientId}`} className="flex justify-between gap-2 rounded px-1 py-1 hover:bg-zinc-50">
                <span className="truncate text-zinc-800">{c.name}</span>
                <span className="tabular text-zinc-900">{formatMoney(c.total)}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={`Top clients FY ${d.fy.long}`} description="By taxable value" />
          <CardBody className="flex flex-col gap-2 text-sm">
            {d.topClients.length === 0 ? <p className="text-zinc-500">No invoices yet this year.</p> : null}
            {d.topClients.map((c) => (
              <Link key={c.clientId} href={`/clients/${c.clientId}`} className="flex justify-between gap-2 rounded px-1 py-1 hover:bg-zinc-50">
                <span className="truncate text-zinc-800">{c.name}</span>
                <span className="tabular text-zinc-900">{formatMoney(c.total)}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={<Link href="/activity" className="text-sm text-brand-700 hover:underline">All</Link>} />
          <CardBody className="flex flex-col gap-3 text-sm">
            {d.recent.length === 0 ? (
              <p className="flex items-center gap-2 text-zinc-500">
                <FileText className="size-4" /> Nothing yet.
              </p>
            ) : null}
            {d.recent.map((a) => (
              <div key={a.id}>
                <p className="line-clamp-2 text-zinc-800">{a.summary}</p>
                <p className="text-xs text-zinc-500">
                  {a.actorLabel} · {formatDateTime(a.createdAt)}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, hint, tone, href }: { label: string; value: string; hint?: string; tone?: "danger"; href: string }) {
  return (
    <Link href={href} className="block">
      <Card className="px-5 py-4 transition-colors hover:border-zinc-300">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular ${tone === "danger" ? "text-red-600" : "text-zinc-900"}`}>{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
      </Card>
    </Link>
  );
}
