"use client";

import { CreditCard, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { payOnlineAction, respondQuoteByTokenAction } from "@/lib/public/actions";

export function PayOnlineButton({ token, label }: { token: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await payOnlineAction(token);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          window.location.href = result.data.url;
        })
      }
    >
      <CreditCard /> {label}
    </Button>
  );
}

export function QuoteResponse({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<"accepted" | "declined" | null>(null);
  function respond(response: "accepted" | "declined") {
    setChoice(response);
    startTransition(async () => {
      const result = await respondQuoteByTokenAction(token, response);
      if (!result.ok) toast.error(result.error);
      else toast.success(result.message ?? "Thank you");
      router.refresh();
    });
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" loading={pending && choice === "accepted"} disabled={pending} onClick={() => respond("accepted")}>
        <ThumbsUp /> Accept quote
      </Button>
      <Button
        size="lg"
        variant="outline"
        loading={pending && choice === "declined"}
        disabled={pending}
        onClick={() => {
          if (confirm("Decline this quote?")) respond("declined");
        }}
      >
        <ThumbsDown /> Decline
      </Button>
    </div>
  );
}
