import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityLog,
  clients,
  documentLines,
  documents,
  emailLog,
  gatewayLinks,
  payments,
  type DocumentRow,
} from "@/lib/db/schema";
import type { DocumentType } from "./types";

export type ListFilter = "all" | "draft" | "unpaid" | "overdue" | "paid" | "void" | "open" | "accepted" | "closed";

export const PAGE_SIZE = 25;

export interface DocumentListRow {
  id: string;
  type: DocumentType;
  status: DocumentRow["status"];
  number: string | null;
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  currency: string;
  total: string;
  balanceDue: string;
  amountPaid: string;
  sentAt: Date | null;
  viewedAt: Date | null;
  clientId: string;
  clientName: string;
  relatedDocumentId: string | null;
}

function filterCondition(type: DocumentType, filter: ListFilter, today: string): SQL | undefined {
  switch (filter) {
    case "draft":
      return eq(documents.status, "draft");
    case "void":
      return eq(documents.status, "void");
    case "unpaid":
      return inArray(documents.status, ["issued", "partially_paid"]);
    case "overdue":
      return and(inArray(documents.status, ["issued", "partially_paid"]), lt(documents.dueDate, today));
    case "paid":
      return eq(documents.status, "paid");
    case "open":
      return and(eq(documents.status, "issued"), type === "quote" ? or(sql`${documents.validUntil} is null`, gte(documents.validUntil, today)) : undefined);
    case "accepted":
      return inArray(documents.status, ["accepted", "converted"]);
    case "closed":
      return or(eq(documents.status, "declined"), and(eq(documents.status, "issued"), lt(documents.validUntil, today)));
    default:
      return undefined;
  }
}

export async function listDocuments(opts: {
  type: DocumentType;
  filter?: ListFilter;
  q?: string;
  clientId?: string;
  from?: string;
  to?: string;
  page?: number;
  today: string;
}): Promise<{ rows: DocumentListRow[]; total: number }> {
  const q = opts.q?.trim();
  const where = and(
    eq(documents.type, opts.type),
    filterCondition(opts.type, opts.filter ?? "all", opts.today),
    opts.clientId ? eq(documents.clientId, opts.clientId) : undefined,
    opts.from ? gte(documents.issueDate, opts.from) : undefined,
    opts.to ? lte(documents.issueDate, opts.to) : undefined,
    q ? or(ilike(documents.number, `%${q}%`), ilike(clients.name, `%${q}%`), ilike(documents.reference, `%${q}%`)) : undefined,
  );
  const page = Math.max(1, opts.page ?? 1);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: documents.id,
        type: documents.type,
        status: documents.status,
        number: documents.number,
        issueDate: documents.issueDate,
        dueDate: documents.dueDate,
        validUntil: documents.validUntil,
        currency: documents.currency,
        total: documents.total,
        balanceDue: documents.balanceDue,
        amountPaid: documents.amountPaid,
        sentAt: documents.sentAt,
        viewedAt: documents.viewedAt,
        clientId: documents.clientId,
        clientName: clients.name,
        relatedDocumentId: documents.relatedDocumentId,
      })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .where(where)
      // Drafts first, then newest issue date / number.
      .orderBy(sql`(${documents.status} = 'draft') desc`, desc(documents.issueDate), desc(documents.number), desc(documents.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ n: count() })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .where(where),
  ]);
  return { rows, total: n };
}

export async function countByFilter(type: DocumentType, today: string): Promise<Record<string, number>> {
  const [row] = await db
    .select({
      all: count(),
      draft: sql<number>`count(*) filter (where ${documents.status} = 'draft')::int`,
      unpaid: sql<number>`count(*) filter (where ${documents.status} in ('issued','partially_paid'))::int`,
      overdue: sql<number>`count(*) filter (where ${documents.status} in ('issued','partially_paid') and ${documents.dueDate} < ${today})::int`,
    })
    .from(documents)
    .where(eq(documents.type, type));
  return row;
}

export async function getDocumentDetail(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return null;
  const [client] = await db.select().from(clients).where(eq(clients.id, doc.clientId));
  const [lines, docPayments, related, children, activity, emails, links] = await Promise.all([
    db.select().from(documentLines).where(eq(documentLines.documentId, id)).orderBy(asc(documentLines.position)),
    db.select().from(payments).where(eq(payments.documentId, id)).orderBy(asc(payments.date), asc(payments.createdAt)),
    doc.relatedDocumentId
      ? db
          .select({ id: documents.id, type: documents.type, number: documents.number, status: documents.status, issueDate: documents.issueDate, total: documents.total })
          .from(documents)
          .where(eq(documents.id, doc.relatedDocumentId))
      : Promise.resolve([]),
    db
      .select({ id: documents.id, type: documents.type, number: documents.number, status: documents.status, issueDate: documents.issueDate, total: documents.total })
      .from(documents)
      .where(eq(documents.relatedDocumentId, id))
      .orderBy(asc(documents.createdAt)),
    db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityType, "document"), eq(activityLog.entityId, id)))
      .orderBy(desc(activityLog.createdAt))
      .limit(50),
    db.select().from(emailLog).where(eq(emailLog.documentId, id)).orderBy(desc(emailLog.createdAt)).limit(20),
    db.select().from(gatewayLinks).where(eq(gatewayLinks.documentId, id)).orderBy(desc(gatewayLinks.createdAt)),
  ]);
  return { doc, client, lines, payments: docPayments, related: related[0] ?? null, children, activity, emails, links };
}

export type DocumentDetail = NonNullable<Awaited<ReturnType<typeof getDocumentDetail>>>;
