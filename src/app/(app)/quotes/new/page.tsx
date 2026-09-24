import type { Metadata } from "next";
import { DocumentEditorPage } from "@/components/documents/editor-page";

export const metadata: Metadata = { title: "New quotes" };

export default async function Page(props: PageProps<"/quotes/new">) {
  return <DocumentEditorPage type="quote" searchParams={await props.searchParams} />;
}
