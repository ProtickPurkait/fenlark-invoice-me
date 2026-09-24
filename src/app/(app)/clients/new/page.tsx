import type { Metadata } from "next";
import Link from "next/link";
import { clientDefaults } from "@/components/clients/client-defaults";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireUser();
  const settings = await getSettings();
  return (
    <>
      <PageHeader
        title="New client"
        back={
          <Link href="/clients" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Clients
          </Link>
        }
      />
      <ClientForm clientId={null} defaults={clientDefaults(null, { currency: settings.defaultCurrency })} />
    </>
  );
}
