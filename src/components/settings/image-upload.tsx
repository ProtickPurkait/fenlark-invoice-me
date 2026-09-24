"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { removeBrandImage, uploadBrandImage } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";

export function ImageUpload({
  kind,
  label,
  hint,
  previewUrl,
  canEdit,
}: {
  kind: "logo" | "signature";
  label: string;
  hint: string;
  previewUrl: string | null;
  canEdit: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadBrandImage(data);
      if (result.ok) toast.success(result.message ?? "Uploaded");
      else toast.error(result.error);
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-zinc-300 bg-zinc-50">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={label} className="max-h-16 max-w-36 object-contain" />
        ) : (
          <span className="text-xs text-zinc-400">No {kind}</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-900">{label}</p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
            />
            <Button type="button" size="sm" variant="outline" loading={pending} onClick={() => input.current?.click()}>
              <ImageUp /> Upload
            </Button>
            {previewUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeBrandImage(kind);
                    if (result.ok) toast.success("Removed");
                    else toast.error(result.error);
                  })
                }
              >
                <Trash2 /> Remove
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
