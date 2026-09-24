import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getPortalEmail } from "@/lib/auth/session";
import { businessName, getSettings, logoUrl } from "@/lib/settings";

export const metadata: Metadata = { title: "Client portal" };

export default async function PortalLoginPage(props: PageProps<"/portal/login">) {
  if (await getPortalEmail()) redirect("/portal");
  const { next } = await props.searchParams;
  const settings = await getSettings();
  const name = businessName(settings);
  return (
    <AuthCard
      brandName={name}
      logoUrl={logoUrl(settings)}
      title="Client portal"
      subtitle={`View and pay your invoices from ${name}. Enter the email address we send invoices to.`}
    >
      <LoginForm audience="portal" redirectTo={typeof next === "string" ? next : null} />
    </AuthCard>
  );
}
