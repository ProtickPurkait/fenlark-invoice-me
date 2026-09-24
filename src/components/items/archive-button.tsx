"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { setItemArchived } from "@/app/(app)/items/actions";
import { Button } from "@/components/ui/button";

export function ArchiveItemButton({ id, archived }: { id: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={archived ? "Restore item" : "Archive item"}
      title={archived ? "Restore" : "Archive"}
      onClick={() =>
        startTransition(async () => {
          const r = await setItemArchived(id, !archived);
          if (r.ok) toast.success(r.message ?? "Done");
          else toast.error(r.error);
        })
      }
    >
      {archived ? <ArchiveRestore /> : <Archive />}
    </Button>
  );
}
