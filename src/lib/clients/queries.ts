import "server-only";
import { and, asc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, documents, type Client } from "@/lib/db/schema";

export const OPEN_INVOICE_STATUSES = ["issued", "partially_paid"] as const;

export interface ClientListRow extends Client {
  outstandingInr: string;
  overdueInr: string;
  openInvoices: number;
}

export async function listClients(opts: { q?: string; archived?: boolean; today: string }): Promise<ClientListRow[]> {
  const q = opts.q?.trim();
  const balances = db
    .select({
      clientId: documents.clientId,
      outstanding: sql<string>`coalesce(sum(${documents.balanceDue} * ${documents.exchangeRate}), 0)`.as("outstanding"),
      overdue:
        sql<string>`coalesce(sum(case when ${documents.dueDate} < ${opts.today} then ${documents.balanceDue} * ${documents.exchangeRate} else 0 end), 0)`.as(
          "overdue",
        ),
      open: sql<number>`count(*)::int`.as("open"),
    })
    .from(documents)
    .where(and(eq(documents.type, "invoice"), inArray(documents.status, [...OPEN_INVOICE_STATUSES])))
    .groupBy(documents.clientId)
    .as("balances");

  const rows = await db
    .select({ client: clients, outstanding: balances.outstanding, overdue: balances.overdue, open: balances.open })
    .from(clients)
    .leftJoin(balances, eq(balances.clientId, clients.id))
    .where(
      and(
        opts.archived ? isNotNull(clients.archivedAt) : isNull(clients.archivedAt),
        q
          ? or(
              ilike(clients.name, `%${q}%`),
              ilike(clients.email, `%${q}%`),
              ilike(clients.gstin, `%${q}%`),
              ilike(clients.contactName, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(clients.name));

  return rows.map((r) => ({
    ...r.client,
    outstandingInr: r.outstanding ?? "0",
    overdueInr: r.overdue ?? "0",
    openInvoices: r.open ?? 0,
  }));
}

export async function getClient(id: string): Promise<Client | null> {
  const [row] = await db.select().from(clients).where(eq(clients.id, id));
  return row ?? null;
}

export async function clientOptions(): Promise<{ id: string; name: string; email: string; gstin: string; country: string; stateCode: string; currency: string }[]> {
  return db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      gstin: clients.gstin,
      country: clients.country,
      stateCode: clients.stateCode,
      currency: clients.currency,
    })
    .from(clients)
    .where(isNull(clients.archivedAt))
    .orderBy(asc(clients.name));
}
