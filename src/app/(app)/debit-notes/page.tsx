import type { Metadata } from "next";
import { DocumentListPage } from "@/components/documents/list-page";

export const metadata: Metadata = { title: "Debit notes" };

export default async function Page(props: PageProps<"/debit-notes">) {
  return <DocumentListPage type="debit_note" searchParams={await props.searchParams} />;
}
