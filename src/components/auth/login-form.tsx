"use client";

import { ArrowLeft, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/card";
import { requestLoginAction, verifyCodeAction } from "@/lib/auth/actions";
import type { LoginAudience } from "@/lib/db/schema";

export function LoginForm({ audience, redirectTo }: { audience: LoginAudience; redirectTo?: string | null }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestLoginAction({ audience, email, redirectTo });
      if (!result.ok) {
        setError(result.fieldErrors ? Object.values(result.fieldErrors)[0] : result.error);
        return;
      }
      setEmail(result.data.email);
      setStep("code");
      setNotice(null);
    });
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyCodeAction({ audience, email, code });
      if (result && !result.ok) setError(result.fieldErrors ? Object.values(result.fieldErrors)[0] : result.error);
    });
  }

  function resend() {
    setError(null);
    startTransition(async () => {
      const result = await requestLoginAction({ audience, email, redirectTo });
      if (!result.ok) setError(result.error);
      else setNotice("We sent a new code.");
    });
  }

  if (step === "code") {
    return (
      <form onSubmit={submitCode} className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-md bg-zinc-50 p-3 text-sm text-zinc-600">
          <Mail className="mt-0.5 size-4 shrink-0 text-brand-700" />
          <p>
            If <span className="font-medium text-zinc-900">{email}</span> has access, we&apos;ve emailed a sign-in link
            and a 6-digit code. It expires in 15 minutes.
          </p>
        </div>
        <Field label="Code" htmlFor="code" error={error ?? undefined}>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-lg tracking-[0.4em]"
            aria-invalid={Boolean(error)}
          />
        </Field>
        {notice ? <p className="text-xs text-emerald-700">{notice}</p> : null}
        <Button type="submit" size="lg" loading={pending} disabled={code.length !== 6}>
          Sign in
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-800"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            <ArrowLeft className="size-3.5" /> Different email
          </button>
          <button type="button" className="text-brand-700 hover:underline" onClick={resend} disabled={pending}>
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitEmail} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Email address" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        Email me a sign-in code
      </Button>
    </form>
  );
}
