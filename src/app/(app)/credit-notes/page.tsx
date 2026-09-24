import type { Metadata } from "next";
import { DocumentListPage } from "@/components/documents/list-page";

export const metadata: Metadata = { title: "Credit notes" };

export default async function Page(props: PageProps<"/credit-notes">) {
  return <DocumentListPage type="credit_note" searchParams={await props.searchParams} />;
}
