import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import { db } from "@/lib/db";
import { clients, documentLines, documents, type DocumentRow } from "@/lib/db/schema";
import { clientSnapshot } from "@/lib/documents/service";
import { documentTitle } from "@/lib/documents/types";
import { loadSettings, sellerSnapshot } from "@/lib/settings";
import { getFile } from "@/lib/storage";
import { buildPdfData } from "./build";
import { DocumentPdf, registerFonts } from "./document-pdf";

async function imageDataUri(key: string | null): Promise<string | null> {
  if (!key) return null;
  const file = await getFile(key);
  if (!file) return null;
  return `data:${file.contentType};base64,${file.data.toString("base64")}`;
}

export function pdfFilename(doc: Pick<DocumentRow, "type" | "number">, registration: Parameters<typeof documentTitle>[1]): string {
  const title = documentTitle(doc.type, registration).replace(/\s+/g, "-");
  return `${title}-${(doc.number ?? "draft").replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
}

export async function renderDocumentPdf(documentId: string): Promise<{ buffer: Buffer; filename: string; doc: DocumentRow }> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc) throw new Error("Document not found");
  const [lines, [client], settings] = await Promise.all([
    db.select().from(documentLines).where(eq(documentLines.documentId, documentId)),
    db.select().from(clients).where(eq(clients.id, doc.clientId)),
    loadSettings(),
  ]);
  const related = doc.relatedDocumentId
    ? ((
        await db
          .select({ number: documents.number, issueDate: documents.issueDate })
          .from(documents)
          .where(eq(documents.id, doc.relatedDocumentId))
      )[0] ?? null)
    : null;

  // Drafts show current details; issued documents use the snapshot taken at issue.
  const seller = doc.sellerSnapshot ?? sellerSnapshot(settings);
  const party = doc.clientSnapshot ?? clientSnapshot(client);
  const [logo, signature] = await Promise.all([imageDataUri(seller.logoPath), imageDataUri(seller.signaturePath)]);

  const data = await buildPdfData({ doc, lines, seller, client: party, related, logo, signature });
  registerFonts();
  const buffer = await renderToBuffer(createElement(DocumentPdf, { data }) as ReactElement<never>);
  return { buffer: Buffer.from(buffer), filename: pdfFilename(doc, seller.gstRegistration), doc };
}
