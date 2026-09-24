"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
  keywords?: string;
}

/**
 * Searchable single-select. `freeText` lets the input keep whatever was typed
 * (used for line-item names that don't come from the catalog).
 */
export function Combobox({
  options,
  value,
  onSelect,
  placeholder,
  freeText,
  inputValue,
  onInputChange,
  className,
  id,
  invalid,
  disabled,
  footer,
}: {
  options: ComboOption[];
  value: string | null;
  onSelect: (option: ComboOption) => void;
  placeholder?: string;
  freeText?: boolean;
  inputValue?: string;
  onInputChange?: (text: string) => void;
  className?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  footer?: React.ReactNode;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  const text = freeText ? (inputValue ?? "") : open ? query : (selected?.label ?? "");
  const search = (freeText ? (inputValue ?? "") : query).trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!search || (!freeText && !open)) return options.slice(0, 50);
    return options
      .filter((o) => `${o.label} ${o.hint ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(search))
      .slice(0, 50);
  }, [options, search, freeText, open]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function choose(option: ComboOption) {
    onSelect(option);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={wrapper} className={cn("relative", className)}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          if (freeText) onInputChange?.(e.target.value);
          else setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && filtered[active] && (!freeText || search)) {
            e.preventDefault();
            choose(filtered[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "Tab") {
            setOpen(false);
          }
        }}
        className={cn(
          "h-9 w-full rounded-md border border-zinc-300 bg-white pl-3 pr-8 text-sm shadow-sm placeholder:text-zinc-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-zinc-50",
          invalid && "border-red-500",
        )}
      />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
      {open && (filtered.length > 0 || footer) ? (
        <div id={listId} role="listbox" className="absolute z-40 mt-1 max-h-72 w-full min-w-64 overflow-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
          {filtered.map((o, i) => (
            <button
              type="button"
              role="option"
              aria-selected={o.value === value}
              key={o.value}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o)}
              className={cn("flex w-full items-start gap-2 px-3 py-2 text-left text-sm", i === active ? "bg-zinc-100" : "")}
            >
              <Check className={cn("mt-0.5 size-4 shrink-0 text-brand-700", o.value === value ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0">
                <span className="block truncate text-zinc-900">{o.label}</span>
                {o.hint ? <span className="block truncate text-xs text-zinc-500">{o.hint}</span> : null}
              </span>
            </button>
          ))}
          {footer ? <div className="border-t border-zinc-100 px-1 pt-1">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
