import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentEditorPage } from "@/components/documents/editor-page";

export const metadata: Metadata = { title: "Edit draft" };

export default async function Page(props: PageProps<"/debit-notes/[id]/edit">) {
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <DocumentEditorPage type="debit_note" documentId={id} />;
}
