import type { Metadata } from "next";
import { DocumentEditorPage } from "@/components/documents/editor-page";

export const metadata: Metadata = { title: "New debit notes" };

export default async function Page(props: PageProps<"/debit-notes/new">) {
  return <DocumentEditorPage type="debit_note" searchParams={await props.searchParams} />;
}
