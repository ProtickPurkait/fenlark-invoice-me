"use client";

import { Ellipsis, Pause, Play, Trash2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteRecurringAction, runRecurringNowAction, setRecurringStatusAction } from "@/lib/recurring/actions";

export function RecurringRowActions({ id, status }: { id: string; status: "active" | "paused" | "ended" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run<T>(fn: () => Promise<{ ok: true; data: T; message?: string } | { ok: false; error: string }>, after?: (d: T) => void) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "Done");
        after?.(r.data);
      }
      router.refresh();
    });
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Actions" disabled={pending}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {status === "active" ? (
          <>
            <DropdownMenuItem onSelect={() => run(() => runRecurringNowAction(id), (d) => d.documentId && router.push(`/invoices/${d.documentId}`))}>
              <Zap /> Create next invoice now
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run(() => setRecurringStatusAction(id, "paused"))}>
              <Pause /> Pause
            </DropdownMenuItem>
          </>
        ) : null}
        {status === "paused" ? (
          <DropdownMenuItem onSelect={() => run(() => setRecurringStatusAction(id, "active"))}>
            <Play /> Resume
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={() => {
            if (confirm("Delete this schedule? Invoices it already created are kept.")) run(() => deleteRecurringAction(id));
          }}
        >
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
