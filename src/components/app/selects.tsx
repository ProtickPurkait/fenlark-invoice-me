import * as React from "react";
import { Select } from "@/components/ui/form";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { CURRENCIES } from "@/lib/money";
import { DEFAULT_GST_RATES, STATE_OPTIONS, UQC_OPTIONS } from "@/lib/tax/gst";

type SelectProps = React.ComponentProps<"select">;

export function StateSelect({ includeForeign, ...props }: SelectProps & { includeForeign?: boolean }) {
  return (
    <Select {...props}>
      <option value="">Select state…</option>
      {STATE_OPTIONS.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name} ({s.code})
        </option>
      ))}
      {includeForeign ? <option value="96">Other countries (96)</option> : null}
    </Select>
  );
}

export function CountrySelect(props: SelectProps) {
  return (
    <Select {...props}>
      {COUNTRY_OPTIONS.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

export function CurrencySelect(props: SelectProps) {
  return (
    <Select {...props}>
      {Object.values(CURRENCIES).map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.major}
        </option>
      ))}
    </Select>
  );
}

export function GstRateSelect(props: SelectProps) {
  return (
    <Select {...props}>
      {DEFAULT_GST_RATES.map((r) => (
        <option key={r} value={r}>
          {r}%
        </option>
      ))}
    </Select>
  );
}

export function UnitSelect(props: SelectProps) {
  return (
    <Select {...props}>
      {UQC_OPTIONS.map((u) => (
        <option key={u.code} value={u.code}>
          {u.label}
        </option>
      ))}
    </Select>
  );
}
