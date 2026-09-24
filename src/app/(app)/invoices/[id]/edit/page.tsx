import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentEditorPage } from "@/components/documents/editor-page";

export const metadata: Metadata = { title: "Edit draft" };

export default async function Page(props: PageProps<"/invoices/[id]/edit">) {
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <DocumentEditorPage type="invoice" documentId={id} />;
}
