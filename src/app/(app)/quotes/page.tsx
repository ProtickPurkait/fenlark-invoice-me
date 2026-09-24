import type { Metadata } from "next";
import { DocumentListPage } from "@/components/documents/list-page";

export const metadata: Metadata = { title: "Quotes" };

export default async function Page(props: PageProps<"/quotes">) {
  return <DocumentListPage type="quote" searchParams={await props.searchParams} />;
}
