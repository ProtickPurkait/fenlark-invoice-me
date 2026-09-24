"use client";

import { errorAt, useActionForm } from "@/components/app/use-action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { saveSeries } from "@/app/(app)/settings/actions";
import { todayIST } from "@/lib/dates";
import { checkSeriesPattern, formatDocumentNumber } from "@/lib/numbering";
import { seriesSchema, type SeriesInput } from "@/lib/validation/settings";

export function SeriesForm({
  title,
  defaults,
  currentNext,
  canEdit,
}: {
  title: string;
  defaults: SeriesInput;
  currentNext: number;
  canEdit: boolean;
}) {
  const { form, onSubmit, pending, errors } = useActionForm({
    schema: seriesSchema,
    defaultValues: { ...defaults, nextNumber: null },
    action: saveSeries,
    onSuccess: (_d, f) => f.setValue("nextNumber", null),
  });
  const { register, watch } = form;
  const [prefix, pattern, padding, next] = watch(["prefix", "pattern", "padding", "nextNumber"]);
  const pad = Number(padding) || 1;
  const check = checkSeriesPattern(pattern ?? "", prefix ?? "", pad);
  const sequence = Number(next) || currentNext;
  const preview = formatDocumentNumber({ pattern: pattern ?? "", prefix: prefix ?? "", padding: pad, sequence, date: todayIST() });

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit} className="contents">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
            <p className="text-sm text-zinc-500">
              Next: <span className="font-mono font-medium text-zinc-900">{preview}</span>{" "}
              <span className="text-xs">({preview.length}/16 chars)</span>
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Prefix" htmlFor={`${defaults.docType}-prefix`} error={errorAt(errors, "prefix")}>
              <Input id={`${defaults.docType}-prefix`} {...register("prefix")} />
            </Field>
            <Field label="Pattern" htmlFor={`${defaults.docType}-pattern`} className="sm:col-span-2" error={errorAt(errors, "pattern") ?? (check.ok ? undefined : check.error)}>
              <Input id={`${defaults.docType}-pattern`} className="font-mono" {...register("pattern")} />
            </Field>
            <Field label="Digits" htmlFor={`${defaults.docType}-padding`} error={errorAt(errors, "padding")}>
              <Input id={`${defaults.docType}-padding`} type="number" min={1} max={8} {...register("padding")} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-6">
              <Checkbox label="Restart numbering every financial year (1 April)" {...register("resetYearly")} />
              <Field
                label="Set next number"
                htmlFor={`${defaults.docType}-next`}
                hint="Only to continue an existing series"
                error={errorAt(errors, "nextNumber")}
              >
                <Input
                  id={`${defaults.docType}-next`}
                  type="number"
                  min={1}
                  className="w-36"
                  placeholder={String(currentNext)}
                  {...register("nextNumber", { setValueAs: (v) => (v === "" || v === null ? null : Number(v)) })}
                />
              </Field>
            </div>
            {canEdit ? (
              <Button type="submit" size="sm" loading={pending} disabled={!form.formState.isDirty}>
                Save
              </Button>
            ) : null}
          </div>
        </fieldset>
      </form>
    </Card>
  );
}
