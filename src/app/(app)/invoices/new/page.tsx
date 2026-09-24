import type { Metadata } from "next";
import { DocumentEditorPage } from "@/components/documents/editor-page";

export const metadata: Metadata = { title: "New invoices" };

export default async function Page(props: PageProps<"/invoices/new">) {
  return <DocumentEditorPage type="invoice" searchParams={await props.searchParams} />;
}
