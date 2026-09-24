import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentDetailPage } from "@/components/documents/detail-page";

export const metadata: Metadata = { title: "Credit notes" };

export default async function Page(props: PageProps<"/credit-notes/[id]">) {
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <DocumentDetailPage type="credit_note" id={id} />;
}
