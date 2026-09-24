"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

/** Search box bound to the `q` search param (debounced). */
export function SearchInput({ placeholder = "Search…", className }: { placeholder?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function update(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (next) sp.set("q", next);
      else sp.delete("q");
      sp.delete("page");
      startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`));
    }, 300);
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => update(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm shadow-sm placeholder:text-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
      />
    </div>
  );
}

/** Pill tabs that set one search param, preserving the rest. */
export function FilterTabs({ param, options, current }: { param: string; options: { value: string; label: string; count?: number }[]; current: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1">
      {options.map((o) => {
        const sp = new URLSearchParams(params.toString());
        if (o.value) sp.set(param, o.value);
        else sp.delete(param);
        sp.delete("page");
        const active = current === o.value;
        return (
          <Link
            key={o.value || "all"}
            href={`${pathname}${sp.size ? `?${sp}` : ""}`}
            className={cn(
              "rounded-md px-3 py-1 text-sm text-zinc-600 hover:text-zinc-900",
              active && "bg-white font-medium text-zinc-900 shadow-xs",
            )}
          >
            {o.label}
            {o.count !== undefined ? <span className="ml-1.5 text-xs text-zinc-400">{o.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(params.toString());
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    return `${pathname}${sp.size ? `?${sp}` : ""}`;
  };
  return (
    <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm text-zinc-500">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50">
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:bg-zinc-50">
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}
