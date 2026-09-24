"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setClientArchived } from "@/app/(app)/clients/actions";
import { Button } from "@/components/ui/button";

export function ClientArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          if (!archived && !confirm("Archive this client? Their documents stay; they just won't appear in pickers.")) return;
          const r = await setClientArchived(id, !archived);
          if (r.ok) toast.success(r.message ?? "Done");
          else toast.error(r.error);
        })
      }
    >
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}
