import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterTabs, Pagination, SearchInput } from "@/components/app/list-controls";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { db } from "@/lib/db";
import { activityLog, documents } from "@/lib/db/schema";
import { documentPath } from "@/lib/documents/types";

export const metadata: Metadata = { title: "Activity" };

const PAGE_SIZE = 50;
const ENTITY_FILTERS = [
  { value: "", label: "All" },
  { value: "document", label: "Documents" },
  { value: "client", label: "Clients" },
  { value: "recurring", label: "Recurring" },
  { value: "settings", label: "Settings" },
  { value: "user", label: "Team" },
  { value: "gateway", label: "Gateways" },
];

const ACTOR_TONES = { user: "neutral", client: "info", system: "muted", gateway: "success" } as const;

export default async function ActivityPage(props: PageProps<"/activity">) {
  await requireUser();
  const sp = await props.searchParams;
  const entity = typeof sp.entity === "string" ? sp.entity : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Number(sp.page) || 1;
  const where = and(entity ? eq(activityLog.entityType, entity) : undefined, q ? ilike(activityLog.summary, `%${q}%`) : undefined);

  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ a: activityLog, docType: documents.type })
      .from(activityLog)
      .leftJoin(documents, and(eq(activityLog.entityType, "document"), sql`${activityLog.entityId} = ${documents.id}::text`))
      .where(where)
      .orderBy(desc(activityLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(activityLog).where(where),
  ]);

  return (
    <>
      <PageHeader title="Activity" description="An audit trail of everything that happened — by your team, your clients, payment gateways and scheduled jobs." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput placeholder="Search activity…" className="lg:w-80" />
        <FilterTabs param="entity" current={entity} options={ENTITY_FILTERS} />
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<History />} title="No activity" />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Who</TH>
                  <TH>What</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map(({ a, docType }) => {
                  const href =
                    a.entityType === "document" && a.entityId && docType
                      ? documentPath(docType, a.entityId)
                      : a.entityType === "client" && a.entityId
                        ? `/clients/${a.entityId}`
                        : a.entityType === "recurring" && a.entityId && a.action !== "delete"
                          ? `/recurring/${a.entityId}`
                          : null;
                  return (
                    <TR key={a.id}>
                      <TD className="whitespace-nowrap text-zinc-500">{formatDateTime(a.createdAt)}</TD>
                      <TD className="whitespace-nowrap">
                        <Badge tone={ACTOR_TONES[a.actorType]}>{a.actorType === "user" ? a.actorLabel : `${a.actorType}: ${a.actorLabel}`}</Badge>
                      </TD>
                      <TD>{href ? <Link href={href} className="text-zinc-800 hover:text-brand-700">{a.summary}</Link> : <span className="text-zinc-800">{a.summary}</span>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={n} />
          </>
        )}
      </Card>
    </>
  );
}
