import { and, asc, ilike, isNotNull, isNull, or } from "drizzle-orm";
import { Package } from "lucide-react";
import type { Metadata } from "next";
import { FilterTabs, SearchInput } from "@/components/app/list-controls";
import { ArchiveItemButton } from "@/components/items/archive-button";
import { ItemDialog } from "@/components/items/item-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { dec, formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Items" };

export default async function ItemsPage(props: PageProps<"/items">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const archived = sp.view === "archived";
  const rows = await db
    .select()
    .from(items)
    .where(
      and(
        archived ? isNotNull(items.archivedAt) : isNull(items.archivedAt),
        q ? or(ilike(items.name, `%${q}%`), ilike(items.hsnSac, `%${q}%`), ilike(items.description, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(asc(items.name));
  const canWrite = can(user.role, "documents:write");

  return (
    <>
      <PageHeader title="Items" description="Services and products you bill often, with their HSN/SAC code and GST rate." actions={canWrite ? <ItemDialog /> : null} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder="Search items…" className="sm:w-80" />
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
          <EmptyState icon={<Package />} title={q ? "No items match" : "No items yet"} description={q ? undefined : "Add the services you sell to fill invoices in one click."} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                <TH>HSN/SAC</TH>
                <TH>GST</TH>
                <TH align="right">Rate</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {rows.map((i) => (
                <TR key={i.id}>
                  <TD>
                    <p className="font-medium text-zinc-900">{i.name}</p>
                    {i.description ? <p className="line-clamp-1 text-xs text-zinc-500">{i.description}</p> : null}
                  </TD>
                  <TD>
                    <span className="font-mono text-zinc-700">{i.hsnSac || "—"}</span>{" "}
                    <Badge tone="muted">{i.kind === "service" ? "Service" : "Goods"}</Badge>
                  </TD>
                  <TD>{dec(i.gstRate).toString()}%</TD>
                  <TD align="right">
                    {formatMoney(i.rate)}
                    {i.unit !== "OTH" ? <span className="text-xs text-zinc-500"> / {i.unit}</span> : null}
                  </TD>
                  <TD align="right" className="whitespace-nowrap">
                    {canWrite ? (
                      <>
                        <ItemDialog
                          itemId={i.id}
                          defaults={{ kind: i.kind, name: i.name, description: i.description, hsnSac: i.hsnSac, unit: i.unit, rate: i.rate, gstRate: dec(i.gstRate).toString() }}
                        />
                        <ArchiveItemButton id={i.id} archived={Boolean(i.archivedAt)} />
                      </>
                    ) : null}
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
