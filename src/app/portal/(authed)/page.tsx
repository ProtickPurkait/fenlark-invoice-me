import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { signOutAction } from "@/lib/auth/actions";
import { requirePortalEmail } from "@/lib/auth/session";
import { formatDate, todayIST } from "@/lib/dates";
import { DOC_LABELS, displayStatus } from "@/lib/documents/types";
import { dec, formatMoney } from "@/lib/money";
import { portalDocuments } from "@/lib/public/queries";
import { businessName, loadSettings, logoUrl } from "@/lib/settings";

export const metadata: Metadata = { title: "Client portal" };

export default async function PortalPage() {
  const email = await requirePortalEmail();
  const settings = await loadSettings();
  const { clients, documents } = await portalDocuments(email);
  const today = todayIST();
  const open = documents.filter((d) => d.type === "invoice" && (d.status === "issued" || d.status === "partially_paid") && dec(d.balanceDue).greaterThan(0));
  const outstanding = new Map<string, ReturnType<typeof dec>>();
  for (const d of open) outstanding.set(d.currency, (outstanding.get(d.currency) ?? dec(0)).plus(d.balanceDue));
  const quotes = documents.filter((d) => d.type === "quote" && d.status === "issued" && (!d.validUntil || d.validUntil >= today));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const multi = clients.length > 1;

  return (
    <PublicShell
      brandName={businessName(settings)}
      logoUrl={logoUrl(settings)}
      right={
        <form action={signOutAction.bind(null, "portal")} className="flex items-center gap-3 text-sm text-zinc-500">
          <span className="hidden sm:inline">{email}</span>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-zinc-100 hover:text-zinc-800">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      }
    >
      <h1 className="text-xl font-semibold text-zinc-900">{[...new Set(clients.map((c) => c.name))].join(", ") || "Your account"}</h1>
      <p className="mt-1 text-sm text-zinc-500">Invoices, quotes and credit notes from {businessName(settings)}.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card className="px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Outstanding</p>
          <p className="mt-1 text-2xl font-semibold tabular text-zinc-900">
            {outstanding.size === 0 ? formatMoney(0) : [...outstanding.entries()].map(([cur, amt]) => formatMoney(amt.toFixed(2), cur)).join(" + ")}
          </p>
          <p className="text-xs text-zinc-500">
            {open.length} unpaid invoice{open.length === 1 ? "" : "s"}
          </p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Open quotes</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{quotes.length}</p>
          <p className="text-xs text-zinc-500">awaiting your response</p>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Documents" />
        {documents.length === 0 ? (
          <EmptyState title="Nothing here yet" description="Documents we send you will appear here." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Document</TH>
                {multi ? <TH>Account</TH> : null}
                <TH>Date</TH>
                <TH>Status</TH>
                <TH align="right">Amount</TH>
              </tr>
            </THead>
            <TBody>
              {documents.map((d) => {
                const s = displayStatus(d, today);
                return (
                  <TR key={d.id}>
                    <TD>
                      <Link href={`/p/${d.publicToken}`} className="font-medium text-zinc-900 hover:text-brand-700">
                        {DOC_LABELS[d.type].singular} {d.number}
                      </Link>
                    </TD>
                    {multi ? <TD className="text-zinc-600">{clientName.get(d.clientId)}</TD> : null}
                    <TD className="whitespace-nowrap text-zinc-600">{formatDate(d.issueDate)}</TD>
                    <TD>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </TD>
                    <TD align="right" className="whitespace-nowrap">
                      {formatMoney(d.total, d.currency)}
                      {d.type === "invoice" && (d.status === "issued" || d.status === "partially_paid") && !dec(d.balanceDue).equals(d.total) ? (
                        <span className="block text-xs text-zinc-500">{formatMoney(d.balanceDue, d.currency)} due</span>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </PublicShell>
  );
}
