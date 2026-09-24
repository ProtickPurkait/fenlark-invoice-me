"use client";

import { CountrySelect, StateSelect } from "@/components/app/selects";
import { errorAt, useActionForm } from "@/components/app/use-action-form";
import { Field, FormSection, Input, Select } from "@/components/ui/form";
import { saveBusinessProfile } from "@/app/(app)/settings/actions";
import { businessProfileSchema, type BusinessProfileInput } from "@/lib/validation/settings";
import { panFromGstin, stateFromGstin } from "@/lib/tax/gst";
import { SettingsForm } from "./form-shell";

export function BusinessForm({ defaults, canEdit }: { defaults: BusinessProfileInput; canEdit: boolean }) {
  const { form, onSubmit, pending, errors } = useActionForm({
    schema: businessProfileSchema,
    defaultValues: defaults,
    action: saveBusinessProfile,
  });
  const { register, watch, setValue } = form;
  const registration = watch("gstRegistration");

  function onGstinBlur(value: string) {
    const gstin = value.trim().toUpperCase();
    const state = stateFromGstin(gstin);
    if (state && !form.getValues("stateCode")) setValue("stateCode", state, { shouldDirty: true });
    const pan = panFromGstin(gstin);
    if (pan && !form.getValues("pan")) setValue("pan", pan, { shouldDirty: true });
  }

  return (
    <SettingsForm onSubmit={onSubmit} pending={pending} dirty={form.formState.isDirty} canEdit={canEdit}>
      <FormSection title="Business" description="Printed at the top of every invoice. Use the legal name exactly as on your GST / PAN registration.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name" htmlFor="legalName" required error={errorAt(errors, "legalName")}>
            <Input id="legalName" {...register("legalName")} />
          </Field>
          <Field label="Trade name" htmlFor="tradeName" hint="Brand name, if different (e.g. Fenlark)" error={errorAt(errors, "tradeName")}>
            <Input id="tradeName" {...register("tradeName")} />
          </Field>
          <Field label="Email" htmlFor="email" hint="Clients' replies go here" error={errorAt(errors, "email")}>
            <Input id="email" type="email" {...register("email")} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errorAt(errors, "phone")}>
            <Input id="phone" {...register("phone")} />
          </Field>
          <Field label="Website" htmlFor="website" className="sm:col-span-2" error={errorAt(errors, "website")}>
            <Input id="website" placeholder="fenlark.in" {...register("website")} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Registered address" description="Your principal place of business. The state decides CGST+SGST vs IGST.">
        <Field label="Address line 1" htmlFor="addressLine1" required error={errorAt(errors, "addressLine1")}>
          <Input id="addressLine1" {...register("addressLine1")} />
        </Field>
        <Field label="Address line 2" htmlFor="addressLine2" error={errorAt(errors, "addressLine2")}>
          <Input id="addressLine2" {...register("addressLine2")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="city" error={errorAt(errors, "city")}>
            <Input id="city" {...register("city")} />
          </Field>
          <Field label="PIN code" htmlFor="postalCode" error={errorAt(errors, "postalCode")}>
            <Input id="postalCode" inputMode="numeric" {...register("postalCode")} />
          </Field>
          <Field label="State" htmlFor="stateCode" required error={errorAt(errors, "stateCode")}>
            <StateSelect id="stateCode" {...register("stateCode")} />
          </Field>
        </div>
        <Field label="Country" htmlFor="country" className="sm:max-w-xs" error={errorAt(errors, "country")}>
          <CountrySelect id="country" {...register("country")} />
        </Field>
      </FormSection>

      <FormSection
        title="Tax registration"
        description="Regular GST taxpayers issue Tax Invoices; composition taxpayers issue Bills of Supply; unregistered businesses issue plain invoices without GST."
      >
        <Field label="GST registration" htmlFor="gstRegistration" className="sm:max-w-xs">
          <Select id="gstRegistration" {...register("gstRegistration")}>
            <option value="regular">Regular GST taxpayer</option>
            <option value="composition">Composition scheme</option>
            <option value="unregistered">Not registered for GST</option>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="GSTIN"
            htmlFor="gstin"
            required={registration !== "unregistered"}
            error={errorAt(errors, "gstin")}
          >
            <Input
              id="gstin"
              className="uppercase"
              maxLength={15}
              placeholder="29ABCDE1234F1Z5"
              {...register("gstin", { onBlur: (e) => onGstinBlur(e.target.value) })}
            />
          </Field>
          <Field label="PAN" htmlFor="pan" hint="Filled from the GSTIN if left blank" error={errorAt(errors, "pan")}>
            <Input id="pan" className="uppercase" maxLength={10} {...register("pan")} />
          </Field>
          <Field label="Udyam (MSME) number" htmlFor="udyamNumber" hint="Optional. Printed so clients know the MSMED Act 45-day payment rule applies." error={errorAt(errors, "udyamNumber")} className="sm:col-span-2">
            <Input id="udyamNumber" className="uppercase" placeholder="UDYAM-KR-03-0012345" {...register("udyamNumber")} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Letter of Undertaking (LUT)"
        description="For exports and SEZ supplies without paying IGST. File the LUT (Form GST RFD-11) on the GST portal each financial year."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="LUT ARN" htmlFor="lutArn" error={errorAt(errors, "lutArn")}>
            <Input id="lutArn" className="uppercase" {...register("lutArn")} />
          </Field>
          <Field label="Valid from" htmlFor="lutValidFrom" error={errorAt(errors, "lutValidFrom")}>
            <Input id="lutValidFrom" type="date" {...register("lutValidFrom")} />
          </Field>
          <Field label="Valid to" htmlFor="lutValidTo" error={errorAt(errors, "lutValidTo")}>
            <Input id="lutValidTo" type="date" {...register("lutValidTo")} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Branding" description="Signatory name appears under the signature on invoices.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Authorised signatory" htmlFor="signatoryName" error={errorAt(errors, "signatoryName")}>
            <Input id="signatoryName" {...register("signatoryName")} />
          </Field>
          <Field label="Brand colour" htmlFor="brandColor" error={errorAt(errors, "brandColor")}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick brand colour"
                className="h-9 w-12 cursor-pointer rounded-md border border-zinc-300 bg-white p-1"
                value={watch("brandColor") || "#0f766e"}
                onChange={(e) => setValue("brandColor", e.target.value, { shouldDirty: true })}
              />
              <Input id="brandColor" {...register("brandColor")} />
            </div>
          </Field>
        </div>
      </FormSection>
    </SettingsForm>
  );
}
