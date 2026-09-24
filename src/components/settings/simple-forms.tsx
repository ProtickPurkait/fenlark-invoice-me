"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CurrencySelect } from "@/components/app/selects";
import { errorAt, useActionForm } from "@/components/app/use-action-form";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormSection, Input, Textarea } from "@/components/ui/form";
import { saveInvoiceDefaults, savePaymentDetails, saveReminders, sendTestEmail } from "@/app/(app)/settings/actions";
import {
  invoiceDefaultsSchema,
  paymentDetailsSchema,
  remindersSchema,
  type InvoiceDefaultsInput,
  type PaymentDetailsInput,
  type RemindersInput,
} from "@/lib/validation/settings";
import { SettingsForm } from "./form-shell";

export function PaymentDetailsForm({ defaults, canEdit }: { defaults: PaymentDetailsInput; canEdit: boolean }) {
  const { form, onSubmit, pending, errors } = useActionForm({
    schema: paymentDetailsSchema,
    defaultValues: defaults,
    action: savePaymentDetails,
  });
  const { register } = form;
  return (
    <SettingsForm onSubmit={onSubmit} pending={pending} dirty={form.formState.isDirty} canEdit={canEdit}>
      <FormSection title="Bank account" description="Printed on invoices so clients can pay by NEFT / RTGS / IMPS, or SWIFT from abroad.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account name" htmlFor="bankAccountName" error={errorAt(errors, "bankAccountName")}>
            <Input id="bankAccountName" {...register("bankAccountName")} />
          </Field>
          <Field label="Bank" htmlFor="bankName" error={errorAt(errors, "bankName")}>
            <Input id="bankName" {...register("bankName")} />
          </Field>
          <Field label="Account number" htmlFor="bankAccountNumber" error={errorAt(errors, "bankAccountNumber")}>
            <Input id="bankAccountNumber" inputMode="numeric" {...register("bankAccountNumber")} />
          </Field>
          <Field label="IFSC" htmlFor="bankIfsc" error={errorAt(errors, "bankIfsc")}>
            <Input id="bankIfsc" className="uppercase" maxLength={11} {...register("bankIfsc")} />
          </Field>
          <Field label="Branch" htmlFor="bankBranch" error={errorAt(errors, "bankBranch")}>
            <Input id="bankBranch" {...register("bankBranch")} />
          </Field>
          <Field label="SWIFT / BIC" htmlFor="bankSwift" hint="For payments from outside India" error={errorAt(errors, "bankSwift")}>
            <Input id="bankSwift" className="uppercase" maxLength={11} {...register("bankSwift")} />
          </Field>
        </div>
      </FormSection>
      <FormSection
        title="UPI"
        description="INR invoices get a scan-to-pay QR code with the amount pre-filled. Works with any UPI app, no gateway fees."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="UPI ID" htmlFor="upiId" error={errorAt(errors, "upiId")}>
            <Input id="upiId" placeholder="fenlark@okhdfcbank" {...register("upiId")} />
          </Field>
          <Field label="Payee name" htmlFor="upiPayeeName" hint="As registered with the UPI ID" error={errorAt(errors, "upiPayeeName")}>
            <Input id="upiPayeeName" {...register("upiPayeeName")} />
          </Field>
        </div>
      </FormSection>
    </SettingsForm>
  );
}

export function InvoiceDefaultsForm({ defaults, canEdit }: { defaults: InvoiceDefaultsInput; canEdit: boolean }) {
  const { form, onSubmit, pending, errors } = useActionForm({
    schema: invoiceDefaultsSchema,
    defaultValues: defaults,
    action: saveInvoiceDefaults,
  });
  const { register } = form;
  return (
    <SettingsForm onSubmit={onSubmit} pending={pending} dirty={form.formState.isDirty} canEdit={canEdit}>
      <FormSection title="Defaults" description="Used for new documents. Each client can override the payment terms.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Default currency" htmlFor="defaultCurrency" error={errorAt(errors, "defaultCurrency")}>
            <CurrencySelect id="defaultCurrency" {...register("defaultCurrency")} />
          </Field>
          <Field label="Payment terms (days)" htmlFor="paymentTermsDays" hint="0 = due on receipt" error={errorAt(errors, "paymentTermsDays")}>
            <Input id="paymentTermsDays" type="number" min={0} max={365} {...register("paymentTermsDays")} />
          </Field>
          <Field label="Quotes valid for (days)" htmlFor="quoteValidityDays" error={errorAt(errors, "quoteValidityDays")}>
            <Input id="quoteValidityDays" type="number" min={1} max={365} {...register("quoteValidityDays")} />
          </Field>
        </div>
        <Checkbox label="Round INR totals to the nearest rupee" hint="The difference is shown as “Round off” on the invoice." {...register("roundOff")} />
      </FormSection>
      <FormSection title="Text on documents" description="Pre-filled on new documents; you can edit them per document.">
        <Field label="Invoice notes" htmlFor="invoiceNotes" error={errorAt(errors, "invoiceNotes")}>
          <Textarea id="invoiceNotes" rows={2} {...register("invoiceNotes")} />
        </Field>
        <Field label="Invoice terms & conditions" htmlFor="invoiceTerms" hint="E.g. late-payment interest, jurisdiction." error={errorAt(errors, "invoiceTerms")}>
          <Textarea id="invoiceTerms" rows={4} {...register("invoiceTerms")} />
        </Field>
        <Field label="Quote terms" htmlFor="quoteTerms" error={errorAt(errors, "quoteTerms")}>
          <Textarea id="quoteTerms" rows={4} {...register("quoteTerms")} />
        </Field>
      </FormSection>
    </SettingsForm>
  );
}

function describeOffset(n: number): string {
  if (n === 0) return "On the due date";
  if (n < 0) return `${-n} day${n === -1 ? "" : "s"} before due`;
  return `${n} day${n === 1 ? "" : "s"} overdue`;
}

export function RemindersForm({
  defaults,
  canEdit,
  emailConfigured,
}: {
  defaults: RemindersInput;
  canEdit: boolean;
  emailConfigured: boolean;
}) {
  const { form, onSubmit, pending, errors } = useActionForm({
    schema: remindersSchema,
    defaultValues: defaults,
    action: saveReminders,
  });
  const { register, watch, setValue } = form;
  const offsets = (watch("reminderOffsets") ?? []) as number[];
  const [draft, setDraft] = useState("7");
  const [testing, startTest] = useTransition();

  function addOffset() {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < -30 || n > 120) {
      toast.error("Use a whole number of days between -30 and 120");
      return;
    }
    if (offsets.includes(n)) return;
    setValue("reminderOffsets", [...offsets, n].sort((a, b) => a - b), { shouldDirty: true });
  }

  return (
    <SettingsForm onSubmit={onSubmit} pending={pending} dirty={form.formState.isDirty} canEdit={canEdit}>
      <FormSection
        title="Payment reminders"
        description="A daily job emails clients about unpaid invoices on these days. Each reminder is sent once per invoice; clients can be excluded individually."
      >
        <Checkbox label="Send automatic payment reminders" {...register("remindersEnabled")} />
        <div className="flex flex-wrap gap-2">
          {offsets.length === 0 ? <span className="text-sm text-zinc-500">No reminder days set.</span> : null}
          {offsets.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pl-3 pr-1 text-sm text-zinc-700">
              {describeOffset(n)}
              <button
                type="button"
                className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                aria-label={`Remove ${describeOffset(n)}`}
                onClick={() => setValue("reminderOffsets", offsets.filter((o) => o !== n), { shouldDirty: true })}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Field label="Add a reminder (days from due date)" htmlFor="offset" hint="Negative = before the due date" error={errorAt(errors, "reminderOffsets")}>
            <Input id="offset" type="number" className="w-32" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </Field>
          <Button type="button" variant="outline" onClick={addOffset} className="mb-[22px]">
            <Plus /> Add
          </Button>
        </div>
      </FormSection>
      <FormSection title="Email" description="Receipts go to the client when a payment is recorded. Add a BCC to keep a copy of everything sent.">
        <Checkbox label="Email a receipt when a payment is recorded" {...register("sendPaymentReceipts")} />
        <Field label="BCC all client emails to" htmlFor="bccEmail" error={errorAt(errors, "bccEmail")} className="sm:max-w-sm">
          <Input id="bccEmail" type="email" placeholder="accounts@fenlark.in" {...register("bccEmail")} />
        </Field>
        <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
          <span className={emailConfigured ? "text-emerald-700" : "text-amber-700"}>
            {emailConfigured ? "Email sending is configured (Resend)." : "RESEND_API_KEY is not set — emails are printed to the server log instead of being sent."}
          </span>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              loading={testing}
              onClick={() =>
                startTest(async () => {
                  const result = await sendTestEmail();
                  if (!result.ok) toast.error(result.error);
                  else toast.success(result.data.status === "sent" ? "Test email sent to you" : "Printed to the server log (email not configured)");
                })
              }
            >
              Send test email
            </Button>
          ) : null}
        </div>
      </FormSection>
    </SettingsForm>
  );
}
