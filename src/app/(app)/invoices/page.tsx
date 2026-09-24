import type { Metadata } from "next";
import { DocumentListPage } from "@/components/documents/list-page";

export const metadata: Metadata = { title: "Invoices" };

export default async function Page(props: PageProps<"/invoices">) {
  return <DocumentListPage type="invoice" searchParams={await props.searchParams} />;
}
