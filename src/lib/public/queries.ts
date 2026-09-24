import "server-only";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { portalEmailMatch } from "@/lib/auth/service";
import { db } from "@/lib/db";
import { clients, documentLines, documents, type DocumentRow } from "@/lib/db/schema";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export async function findByPublicToken(token: string): Promise<DocumentRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [doc] = await db.select().from(documents).where(and(eq(documents.publicToken, token), ne(documents.status, "draft")));
  return doc ?? null;
}

export async function publicDocument(token: string) {
  const doc = await findByPublicToken(token);
  if (!doc) return null;
  const [lines, related] = await Promise.all([
    db.select().from(documentLines).where(eq(documentLines.documentId, doc.id)).orderBy(asc(documentLines.position)),
    doc.relatedDocumentId
      ? db
          .select({ number: documents.number, publicToken: documents.publicToken, issueDate: documents.issueDate })
          .from(documents)
          .where(eq(documents.id, doc.relatedDocumentId))
      : Promise.resolve([]),
  ]);
  return { doc, lines, related: related[0] ?? null };
}

/** Everything a portal user (by e-mail) can see: issued documents of their clients. */
export async function portalDocuments(email: string) {
  const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(portalEmailMatch(email));
  if (clientRows.length === 0) return { clients: clientRows, documents: [] };
  const docs = await db
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
      sentAt: documents.sentAt,
      viewedAt: documents.viewedAt,
      publicToken: documents.publicToken,
      clientId: documents.clientId,
    })
    .from(documents)
    .where(
      and(
        inArray(
          documents.clientId,
          clientRows.map((c) => c.id),
        ),
        ne(documents.status, "draft"),
        or(ne(documents.status, "void"), sql`${documents.type} = 'invoice'`),
      ),
    )
    .orderBy(desc(documents.issueDate), desc(documents.number))
    .limit(500);
  return { clients: clientRows, documents: docs };
}
