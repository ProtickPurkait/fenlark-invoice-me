"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { verifyTokenAction } from "@/lib/auth/actions";
import type { LoginAudience } from "@/lib/db/schema";

/**
 * Consuming the token needs a click: email security scanners pre-fetch links,
 * and a GET that signs in would burn the token before the user sees it.
 */
export function ConfirmSignIn({ audience, token, email }: { audience: LoginAudience; token: string; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="text-sm text-zinc-600">
        Continue as <span className="font-medium text-zinc-900">{email}</span>
      </p>
      <Button
        size="lg"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await verifyTokenAction(audience, token);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        Sign in
      </Button>
    </div>
  );
}
