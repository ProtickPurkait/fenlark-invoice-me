import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterTabs, SearchInput } from "@/components/app/list-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { listClients } from "@/lib/clients/queries";
import { countryName } from "@/lib/countries";
import { todayIST } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { stateName } from "@/lib/tax/gst";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage(props: PageProps<"/clients">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const archived = sp.view === "archived";
  const rows = await listClients({ q, archived, today: todayIST() });

  return (
    <>
      <PageHeader
        title="Clients"
        description="People and businesses you bill."
        actions={
          can(user.role, "clients:write") ? (
            <Button asChild>
              <Link href="/clients/new">
                <Plus /> New client
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder="Search name, email, GSTIN…" className="sm:w-80" />
        <FilterTabs
          param="view"
          current={archived ? "archived" : ""}
          options={[
            { value: "", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={q ? "No clients match your search" : archived ? "No archived clients" : "No clients yet"}
            description={q || archived ? undefined : "Add your first client to start invoicing."}
            action={
              !q && !archived && can(user.role, "clients:write") ? (
                <Button asChild>
                  <Link href="/clients/new">
                    <Plus /> New client
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Client</TH>
                <TH>Contact</TH>
                <TH>Location</TH>
                <TH align="right">Outstanding</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((c) => (
                <TR key={c.id} className="cursor-pointer">
                  <TD>
                    <Link href={`/clients/${c.id}`} className="font-medium text-zinc-900 hover:text-brand-700">
                      {c.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-zinc-500">
                      {c.gstin ? <span className="font-mono">{c.gstin}</span> : <span>{c.country === "IN" ? "Unregistered" : "Overseas"}</span>}
                      {c.isSez ? <Badge tone="info">SEZ</Badge> : null}
                    </div>
                  </TD>
                  <TD className="text-zinc-600">
                    {c.contactName ? <div>{c.contactName}</div> : null}
                    <div className="text-xs text-zinc-500">{c.email}</div>
                  </TD>
                  <TD className="text-zinc-600">{c.country === "IN" ? stateName(c.stateCode) : countryName(c.country)}</TD>
                  <TD align="right">
                    {Number(c.outstandingInr) > 0 ? (
                      <>
                        <div className="font-medium text-zinc-900">{formatMoney(c.outstandingInr)}</div>
                        {Number(c.overdueInr) > 0 ? <div className="text-xs text-red-600">{formatMoney(c.overdueInr)} overdue</div> : null}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
