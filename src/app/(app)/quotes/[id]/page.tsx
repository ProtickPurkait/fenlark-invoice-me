import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentDetailPage } from "@/components/documents/detail-page";

export const metadata: Metadata = { title: "Quotes" };

export default async function Page(props: PageProps<"/quotes/[id]">) {
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <DocumentDetailPage type="quote" id={id} />;
}
