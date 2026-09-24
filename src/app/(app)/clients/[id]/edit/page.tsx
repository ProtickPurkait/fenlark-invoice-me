import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { clientDefaults } from "@/components/clients/client-defaults";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getClient } from "@/lib/clients/queries";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage(props: PageProps<"/clients/[id]/edit">) {
  await requireUser();
  const { id } = await props.params;
  const client = z.uuid().safeParse(id).success ? await getClient(id) : null;
  if (!client) notFound();
  const settings = await getSettings();
  return (
    <>
      <PageHeader
        title={`Edit ${client.name}`}
        back={
          <Link href={`/clients/${client.id}`} className="text-sm text-zinc-500 hover:text-zinc-800">
            ← {client.name}
          </Link>
        }
      />
      <ClientForm clientId={client.id} defaults={clientDefaults(client, { currency: settings.defaultCurrency })} />
    </>
  );
}
