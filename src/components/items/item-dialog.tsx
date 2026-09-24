"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { GstRateSelect, UnitSelect } from "@/components/app/selects";
import { errorAt, useActionForm } from "@/components/app/use-action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { saveItem } from "@/app/(app)/items/actions";
import { itemSchema, type ItemInput } from "@/lib/validation/catalog";

const EMPTY: ItemInput = { kind: "service", name: "", description: "", hsnSac: "", unit: "OTH", rate: "", gstRate: "18" };

export function ItemDialog({ itemId, defaults }: { itemId?: string; defaults?: ItemInput }) {
  const [open, setOpen] = useState(false);
  const { form, onSubmit, pending, errors } = useActionForm({
    schema: itemSchema,
    defaultValues: defaults ?? EMPTY,
    action: (values) => saveItem(itemId ?? null, values),
    onSuccess: (_d, f) => {
      if (!itemId) f.reset(EMPTY);
      setOpen(false);
    },
  });
  const { register } = form;
  const kind = form.watch("kind");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {itemId ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit item">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus /> New item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={itemId ? "Edit item" : "New item"} description="Saved items fill in the line automatically when you pick them on an invoice.">
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Type" htmlFor="item-kind">
            <Select id="item-kind" {...register("kind")}>
              <option value="service">Service (SAC)</option>
              <option value="goods">Goods (HSN)</option>
            </Select>
          </Field>
          <Field label={kind === "service" ? "SAC code" : "HSN code"} htmlFor="item-hsn" hint={kind === "service" ? "e.g. 998314 IT design & development" : "4–8 digits"} error={errorAt(errors, "hsnSac")}>
            <Input id="item-hsn" inputMode="numeric" {...register("hsnSac")} />
          </Field>
          <Field label="Name" htmlFor="item-name" required className="sm:col-span-2" error={errorAt(errors, "name")}>
            <Input id="item-name" autoFocus {...register("name")} />
          </Field>
          <Field label="Description" htmlFor="item-desc" className="sm:col-span-2" error={errorAt(errors, "description")}>
            <Textarea id="item-desc" rows={2} {...register("description")} />
          </Field>
          <Field label="Rate (₹)" htmlFor="item-rate" required error={errorAt(errors, "rate")}>
            <Input id="item-rate" inputMode="decimal" {...register("rate")} />
          </Field>
          <Field label="Unit" htmlFor="item-unit">
            <UnitSelect id="item-unit" {...register("unit")} />
          </Field>
          <Field label="GST rate" htmlFor="item-gst" error={errorAt(errors, "gstRate")}>
            <GstRateSelect id="item-gst" {...register("gstRate")} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
