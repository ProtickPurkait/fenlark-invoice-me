import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/session";
import { businessName, getSettings, logoUrl } from "@/lib/settings";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await props.searchParams;
  const settings = await getSettings();
  return (
    <AuthCard
      brandName={businessName(settings)}
      logoUrl={logoUrl(settings)}
      title="Sign in to billing"
      subtitle="We'll email you a one-time code. No password needed."
      footer={
        <>
          Are you a client? <a className="text-brand-700 hover:underline" href="/portal/login">Open the client portal</a>
        </>
      }
    >
      <LoginForm audience="staff" redirectTo={typeof next === "string" ? next : null} />
    </AuthCard>
  );
}
