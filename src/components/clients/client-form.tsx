"use client";

import { useRouter } from "next/navigation";
import { CountrySelect, CurrencySelect, StateSelect } from "@/components/app/selects";
import { errorAt, useActionForm } from "@/components/app/use-action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, FormSection, Input, Select, Textarea } from "@/components/ui/form";
import { saveClient, type SavedClient } from "@/app/(app)/clients/actions";
import { panFromGstin, stateFromGstin, TDS_SECTIONS } from "@/lib/tax/gst";
import { clientSchema, type ClientInput } from "@/lib/validation/catalog";

export function ClientForm({
  clientId,
  defaults,
  onSaved,
  compact,
}: {
  clientId: string | null;
  defaults: ClientInput;
  /** When set (e.g. in the invoice editor's quick-add dialog) the page doesn't navigate. */
  onSaved?: (client: SavedClient) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const { form, onSubmit, pending, errors } = useActionForm({
    schema: clientSchema,
    defaultValues: defaults,
    action: (values) => saveClient(clientId, values),
    successMessage: "Client saved",
    onSuccess: (data) => {
      if (onSaved) onSaved(data);
      else router.push(`/clients/${data.id}`);
    },
  });
  const { register, watch, setValue, getValues } = form;
  const country = watch("country");
  const kind = watch("kind");
  const tds = watch("tdsApplicable");
  const isIndia = country === "IN";

  function onGstinBlur(value: string) {
    const gstin = value.trim().toUpperCase();
    const state = stateFromGstin(gstin);
    if (state && !getValues("stateCode")) setValue("stateCode", state, { shouldDirty: true });
    const pan = panFromGstin(gstin);
    if (pan && !getValues("pan")) setValue("pan", pan, { shouldDirty: true });
  }

  const body = (
    <>
      <FormSection title="Client" description="Use the registered legal name — it's printed as “Bill to”.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="kind">
            <Select id="kind" {...register("kind")}>
              <option value="business">Business</option>
              <option value="individual">Individual</option>
            </Select>
          </Field>
          <Field label={kind === "business" ? "Legal name" : "Full name"} htmlFor="name" required error={errorAt(errors, "name")}>
            <Input id="name" autoFocus={!clientId} {...register("name")} />
          </Field>
          {kind === "business" ? (
            <Field label="Contact person" htmlFor="contactName" error={errorAt(errors, "contactName")}>
              <Input id="contactName" {...register("contactName")} />
            </Field>
          ) : null}
          <Field label="Phone" htmlFor="phone" error={errorAt(errors, "phone")}>
            <Input id="phone" {...register("phone")} />
          </Field>
          <Field label="Email" htmlFor="email" hint="Invoices are sent here; also the client-portal login" error={errorAt(errors, "email")}>
            <Input id="email" type="email" {...register("email")} />
          </Field>
          <Field label="CC" htmlFor="ccEmails" hint="Comma-separated, e.g. accounts team" error={errorAt(errors, "ccEmails")}>
            <Input id="ccEmails" {...register("ccEmails")} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Billing address" description="The state sets the place of supply, which decides CGST+SGST (same state) or IGST.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country" htmlFor="country" error={errorAt(errors, "country")}>
            <CountrySelect id="country" {...register("country")} />
          </Field>
          {isIndia ? (
            <Field label="State" htmlFor="stateCode" required error={errorAt(errors, "stateCode")}>
              <StateSelect id="stateCode" {...register("stateCode")} />
            </Field>
          ) : null}
        </div>
        <Field label="Address line 1" htmlFor="addressLine1" error={errorAt(errors, "addressLine1")}>
          <Input id="addressLine1" {...register("addressLine1")} />
        </Field>
        <Field label="Address line 2" htmlFor="addressLine2" error={errorAt(errors, "addressLine2")}>
          <Input id="addressLine2" {...register("addressLine2")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="city" error={errorAt(errors, "city")}>
            <Input id="city" {...register("city")} />
          </Field>
          <Field label={isIndia ? "PIN code" : "Postal code"} htmlFor="postalCode" error={errorAt(errors, "postalCode")}>
            <Input id="postalCode" {...register("postalCode")} />
          </Field>
        </div>
        {!compact ? (
          <Field label="Shipping address" htmlFor="shippingAddress" hint="Only if goods ship somewhere else" error={errorAt(errors, "shippingAddress")}>
            <Textarea id="shippingAddress" rows={2} {...register("shippingAddress")} />
          </Field>
        ) : null}
      </FormSection>

      {isIndia ? (
        <FormSection title="Tax" description="Add the GSTIN for registered businesses — invoices then qualify for their input tax credit (B2B).">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GSTIN" htmlFor="gstin" error={errorAt(errors, "gstin")}>
              <Input
                id="gstin"
                className="uppercase"
                maxLength={15}
                {...register("gstin", { onBlur: (e) => onGstinBlur(e.target.value) })}
              />
            </Field>
            <Field label="PAN" htmlFor="pan" error={errorAt(errors, "pan")}>
              <Input id="pan" className="uppercase" maxLength={10} {...register("pan")} />
            </Field>
          </div>
          <Checkbox label="SEZ unit / developer" hint="Supplies are zero-rated (under LUT or with IGST)." {...register("isSez")} />
          <Checkbox label="Client deducts TDS from payments" hint="Common for professional services (Section 194J)." {...register("tdsApplicable")} />
          {tds ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="TDS section" htmlFor="tdsSection">
                <Select id="tdsSection" {...register("tdsSection")}>
                  <option value="">Select…</option>
                  {TDS_SECTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="TDS rate (%)" htmlFor="tdsRate" hint="Usually 10% (194J) or 2% (194C, technical services)" error={errorAt(errors, "tdsRate")}>
                <Input id="tdsRate" inputMode="decimal" {...register("tdsRate")} />
              </Field>
              <Field label="Client's TAN" htmlFor="tan" hint="Helps match TDS credits in Form 26AS" error={errorAt(errors, "tan")}>
                <Input id="tan" className="uppercase" maxLength={10} {...register("tan")} />
              </Field>
            </div>
          ) : null}
        </FormSection>
      ) : null}

      <FormSection title="Billing preferences">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" htmlFor="currency" error={errorAt(errors, "currency")}>
            <CurrencySelect id="currency" {...register("currency")} />
          </Field>
          <Field label="Payment terms (days)" htmlFor="paymentTermsDays" hint="Blank = your default" error={errorAt(errors, "paymentTermsDays")}>
            <Input id="paymentTermsDays" type="number" min={0} max={365} {...register("paymentTermsDays")} />
          </Field>
        </div>
        <Checkbox label="Send automatic payment reminders" {...register("remindersEnabled")} />
        <Checkbox label="Allow access to the client portal" {...register("portalEnabled")} />
        {!compact ? (
          <Field label="Internal notes" htmlFor="notes" hint="Never shown to the client" error={errorAt(errors, "notes")}>
            <Textarea id="notes" rows={2} {...register("notes")} />
          </Field>
        ) : null}
      </FormSection>
    </>
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      {compact ? body : <Card className="px-6 py-8">{body}</Card>}
      <div className={compact ? "mt-4 flex justify-end gap-2" : "sticky bottom-0 mt-4 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50/90 py-3 backdrop-blur"}>
        {!compact ? (
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={pending}>
          {clientId ? "Save client" : "Add client"}
        </Button>
      </div>
    </form>
  );
}
