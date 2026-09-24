import type { Metadata } from "next";
import { DocumentEditorPage } from "@/components/documents/editor-page";

export const metadata: Metadata = { title: "New credit notes" };

export default async function Page(props: PageProps<"/credit-notes/new">) {
  return <DocumentEditorPage type="credit_note" searchParams={await props.searchParams} />;
}
