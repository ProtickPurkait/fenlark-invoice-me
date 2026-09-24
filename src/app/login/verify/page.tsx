import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ConfirmSignIn } from "@/components/auth/confirm-sign-in";
import { peekLoginToken } from "@/lib/auth/service";
import { businessName, getSettings, logoUrl } from "@/lib/settings";

export const metadata: Metadata = { title: "Sign in" };

export default async function VerifyPage(props: PageProps<"/login/verify">) {
  const { token } = await props.searchParams;
  const settings = await getSettings();
  const email = typeof token === "string" ? await peekLoginToken(token, "staff") : null;
  return (
    <AuthCard brandName={businessName(settings)} logoUrl={logoUrl(settings)} title="Sign in">
      {email && typeof token === "string" ? (
        <ConfirmSignIn audience="staff" token={token} email={email} />
      ) : (
        <div className="flex flex-col gap-4 text-sm text-zinc-600">
          <p>This sign-in link has expired or was already used.</p>
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Request a new code →
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
