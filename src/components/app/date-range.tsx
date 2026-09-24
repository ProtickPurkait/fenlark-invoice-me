"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { financialYear, monthRange, todayIST } from "@/lib/dates";
import { Input, Select } from "@/components/ui/form";

/** From/to date filter bound to `from` / `to` search params, with quick presets. */
export function DateRangeFilter({ from, to }: { from: string | null; to: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(next: { from: string | null; to: string | null }) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete("page");
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`);
  }

  const today = todayIST();
  const fy = financialYear(today);
  const lastFy = financialYear(`${fy.startYear - 1}-06-01`);
  const month = monthRange(today.slice(0, 7));
  const prevMonthDate = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const prev = monthRange(prevMonthDate);
  const presets: Record<string, { from: string | null; to: string | null; label: string }> = {
    all: { from: null, to: null, label: "All time" },
    month: { from: month.start, to: month.end, label: "This month" },
    prev: { from: prev.start, to: prev.end, label: "Last month" },
    fy: { from: fy.start, to: fy.end, label: `FY ${fy.long}` },
    lastfy: { from: lastFy.start, to: lastFy.end, label: `FY ${lastFy.long}` },
  };
  const current = Object.entries(presets).find(([, p]) => p.from === from && p.to === to)?.[0] ?? "custom";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Period"
        className="w-40"
        value={current}
        onChange={(e) => {
          const p = presets[e.target.value];
          if (p) apply({ from: p.from, to: p.to });
        }}
      >
        {Object.entries(presets).map(([k, p]) => (
          <option key={k} value={k}>
            {p.label}
          </option>
        ))}
        {current === "custom" ? <option value="custom">Custom</option> : null}
      </Select>
      <Input type="date" aria-label="From" className="w-40" value={from ?? ""} onChange={(e) => apply({ from: e.target.value || null, to })} />
      <span className="text-sm text-zinc-400">to</span>
      <Input type="date" aria-label="To" className="w-40" value={to ?? ""} onChange={(e) => apply({ from, to: e.target.value || null })} />
    </div>
  );
}
