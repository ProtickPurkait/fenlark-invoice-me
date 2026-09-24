"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { clientDefaults } from "@/components/clients/client-defaults";
import { ClientForm } from "@/components/clients/client-form";
import { CurrencySelect, GstRateSelect, StateSelect, UnitSelect } from "@/components/app/selects";
import { errorAt } from "@/components/app/use-action-form";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/card";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { amountInWords } from "@/lib/amount-in-words";
import { calculateDocument } from "@/lib/calc/document";
import { addDays } from "@/lib/dates";
import { fetchExchangeRateAction, saveDocumentAction } from "@/lib/documents/actions";
import { saveRecurringAction } from "@/lib/recurring/actions";
import type { ScheduleInput } from "@/lib/recurring/service";
import { supplyTypeLabel, taxContext } from "@/lib/documents/tax-context";
import { DOC_LABELS, NOTE_REASONS, RECURRING_FREQUENCIES, documentPath, type DocumentType, type GstRegistration } from "@/lib/documents/types";
import { formatAmount, formatMoney } from "@/lib/money";
import { defaultPlaceOfSupply, placeOfSupplyLabel, type ExportTax, type SupplyType } from "@/lib/tax/gst";
import { cn } from "@/lib/utils";
import { documentSchema, emptyLine, type DocumentInputValues, type LineInputValues } from "@/lib/validation/document";

export interface EditorClient {
  id: string;
  name: string;
  email: string;
  gstin: string;
  country: string;
  stateCode: string;
  isSez: boolean;
  currency: string;
  paymentTermsDays: number | null;
}

export interface EditorItem {
  id: string;
  name: string;
  description: string;
  hsnSac: string;
  unit: string;
  rate: string;
  gstRate: string;
}

export interface EditorSettings {
  registration: GstRegistration;
  stateCode: string;
  roundOff: boolean;
  paymentTermsDays: number;
  quoteValidityDays: number;
  defaultCurrency: string;
  hasLut: boolean;
  profileProblems: string[];
}

export interface EditorInvoiceRef {
  id: string;
  number: string;
  issueDate: string;
  clientId: string;
  clientName: string;
  currency: string;
  exchangeRate: string;
  placeOfSupply: string | null;
  supplyType: SupplyType;
  exportTax: ExportTax | null;
  reverseCharge: boolean;
  total: string;
}

const TERMS_PRESETS = [0, 7, 15, 30, 45, 60, 90];

export function DocumentEditor({
  documentId,
  defaults,
  clients: initialClients,
  items,
  settings,
  invoices,
  canCreateClients,
  recurring,
}: {
  documentId: string | null;
  defaults: DocumentInputValues;
  clients: EditorClient[];
  items: EditorItem[];
  settings: EditorSettings;
  /** For credit/debit notes: the invoices they can be raised against. */
  invoices?: EditorInvoiceRef[];
  canCreateClients: boolean;
  /** Edit a recurring schedule's template instead of a document. */
  recurring?: { profileId: string | null; schedule: ScheduleInput };
}) {
  const router = useRouter();
  const type = defaults.type as DocumentType;
  const isNote = type === "credit_note" || type === "debit_note";
  const [clients, setClients] = useState(initialClients);
  const [pending, startTransition] = useTransition();
  const [submitMode, setSubmitMode] = useState<"draft" | "issue">("draft");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [fxNote, setFxNote] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleInput | null>(recurring?.schedule ?? null);

  const form = useForm<DocumentInputValues>({
    resolver: zodResolver(documentSchema) as never,
    defaultValues: defaults,
    mode: "onTouched",
  });
  const { register, control, setValue, getValues, formState } = form;
  const errors = formState.errors;
  const lines = useFieldArray({ control, name: "lines" });

  const [clientId, issueDate, dueDate, currency, placeOfSupply, exportTax, reverseCharge, relatedId] = useWatch({
    control,
    name: ["clientId", "issueDate", "dueDate", "currency", "placeOfSupply", "exportTax", "reverseCharge", "relatedDocumentId"],
  });
  const watchedLines = useWatch({ control, name: "lines" });

  const client = clients.find((c) => c.id === clientId) ?? null;
  const invoice = isNote ? (invoices?.find((i) => i.id === relatedId) ?? null) : null;

  const ctx = useMemo(() => {
    if (isNote && invoice) {
      const base = taxContext({
        registration: settings.registration,
        sellerStateCode: settings.stateCode,
        placeOfSupply: invoice.placeOfSupply,
        clientCountry: client?.country ?? "IN",
        isSez: client?.isSez ?? false,
        exportTax: invoice.exportTax,
      });
      return { ...base, supplyType: invoice.supplyType };
    }
    return taxContext({
      registration: settings.registration,
      sellerStateCode: settings.stateCode,
      placeOfSupply: placeOfSupply || null,
      clientCountry: client?.country ?? "IN",
      isSez: client?.isSez ?? false,
      exportTax: exportTax ?? null,
    });
  }, [isNote, invoice, settings, client, placeOfSupply, exportTax]);

  const effectiveCurrency = isNote && invoice ? invoice.currency : currency;
  const calc = useMemo(
    () =>
      calculateDocument({
        split: ctx.split,
        roundOff: settings.roundOff && effectiveCurrency === "INR",
        reverseCharge: ctx.gstEnabled && (isNote && invoice ? invoice.reverseCharge : Boolean(reverseCharge)),
        lines: (watchedLines ?? []).map((l) => ({
          quantity: safeNum(l.quantity),
          rate: safeNum(l.rate),
          discountType: l.discountType,
          discountValue: safeNum(l.discountValue),
          gstRate: safeNum(l.gstRate),
          hsnSac: l.hsnSac,
          unit: l.unit,
        })),
      }),
    [watchedLines, ctx, settings.roundOff, effectiveCurrency, reverseCharge, isNote, invoice],
  );

  function termsFor(c: EditorClient | null): number {
    return c?.paymentTermsDays ?? settings.paymentTermsDays;
  }

  function onClientChange(id: string, known?: EditorClient) {
    const c = known ?? clients.find((x) => x.id === id);
    setValue("clientId", id, { shouldDirty: true, shouldValidate: true });
    if (!c || isNote) return;
    setValue("placeOfSupply", defaultPlaceOfSupply({ country: c.country, stateCode: c.stateCode, gstin: c.gstin }) ?? "", { shouldDirty: true });
    setValue("currency", c.currency, { shouldDirty: true });
    if (c.currency === "INR") setValue("exchangeRate", "1");
    else if (getValues("exchangeRate") === "1") setValue("exchangeRate", "");
    if (type === "invoice") setValue("dueDate", addDays(getValues("issueDate"), termsFor(c)), { shouldDirty: true });
  }

  function onInvoiceChange(id: string) {
    const inv = invoices?.find((i) => i.id === id);
    if (!inv) return;
    setValue("relatedDocumentId", inv.id, { shouldDirty: true, shouldValidate: true });
    setValue("clientId", inv.clientId);
    setValue("currency", inv.currency);
    setValue("exchangeRate", inv.exchangeRate);
    setValue("placeOfSupply", inv.placeOfSupply ?? "");
    setValue("exportTax", inv.exportTax);
    setValue("reverseCharge", inv.reverseCharge);
  }

  function onIssueDateChange(value: string) {
    const previous = getValues("issueDate");
    setValue("issueDate", value, { shouldDirty: true, shouldValidate: true });
    if (!value || !previous) return;
    const shift = (d: string | null | undefined) => (d ? addDays(d, daysDiff(previous, value)) : d);
    if (type === "invoice" || type === "debit_note") setValue("dueDate", shift(getValues("dueDate")) ?? null);
    if (type === "quote") setValue("validUntil", shift(getValues("validUntil")) ?? null);
  }

  async function fetchRate() {
    const result = await fetchExchangeRateAction(currency, issueDate);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setValue("exchangeRate", result.data.rate, { shouldDirty: true, shouldValidate: true });
    setFxNote(`${result.data.source}, ${result.data.date}. Check against the RBI reference rate if you need to.`);
  }

  function submitSchedule() {
    if (!schedule) return;
    form.handleSubmit(
      () => {
        const values = getValues();
        startTransition(async () => {
          const result = await saveRecurringAction(recurring?.profileId ?? null, { schedule, document: values });
          if (!result.ok) {
            toast.error(result.fieldErrors ? `${result.error} ${Object.values(result.fieldErrors).join(" ")}` : result.error);
            return;
          }
          toast.success("Recurring schedule saved");
          form.reset(values);
          router.push("/recurring");
          router.refresh();
        });
      },
      () => toast.error("Please fix the highlighted fields."),
    )();
  }

  function submit(mode: "draft" | "issue") {
    setSubmitMode(mode);
    form.handleSubmit(
      () => {
        const values = getValues();
        startTransition(async () => {
          const result = await saveDocumentAction(documentId, values, mode === "issue");
          if (!result.ok) {
            if (result.fieldErrors) {
              for (const [name, message] of Object.entries(result.fieldErrors)) form.setError(name as never, { message });
            }
            toast.error(result.error);
            return;
          }
          if (mode === "issue" && !result.data.issued) {
            toast.error(`Saved as a draft, but not issued: ${result.data.error}`, { duration: 10000 });
          } else {
            toast.success(mode === "issue" ? `${DOC_LABELS[type].singular} issued` : "Draft saved");
          }
          form.reset(values);
          router.push(documentPath(result.data.type, result.data.id));
          router.refresh();
        });
      },
      () => toast.error("Please fix the highlighted fields."),
    )();
  }

  const clientOptions: ComboOption[] = clients.map((c) => ({
    value: c.id,
    label: c.name,
    hint: [c.gstin || (c.country === "IN" ? "Unregistered" : c.country), c.email].filter(Boolean).join(" · "),
  }));
  const invoiceOptions: ComboOption[] = (invoices ?? []).map((i) => ({
    value: i.id,
    label: `${i.number} — ${i.clientName}`,
    hint: `${i.issueDate} · ${formatMoney(i.total, i.currency)}`,
    keywords: i.clientName,
  }));
  const itemOptions: ComboOption[] = items.map((i) => ({
    value: i.id,
    label: i.name,
    hint: [i.hsnSac && `HSN/SAC ${i.hsnSac}`, formatMoney(i.rate), `GST ${Number(i.gstRate)}%`].filter(Boolean).join(" · "),
  }));

  const zeroRated = ctx.supplyType === "export" || ctx.supplyType === "sez";
  const termsDays = issueDate && dueDate ? daysDiff(issueDate, dueDate) : null;

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="flex flex-col gap-6">
      {settings.profileProblems.length ? (
        <Alert tone="warning" title="Your business profile is incomplete">
          You can save drafts, but issuing needs: {settings.profileProblems.join(", ")}.{" "}
          <a href="/settings/business" className="font-medium underline">
            Complete it in Settings
          </a>
          .
        </Alert>
      ) : null}

      {schedule ? <ScheduleCard schedule={schedule} onChange={setSchedule} editing={Boolean(recurring?.profileId)} /> : null}

      <Card>
        <CardHeader title="Details" />
        <CardBody className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isNote ? (
            <Field label="Original invoice" htmlFor="relatedDocumentId" required error={errorAt(errors, "relatedDocumentId")} className="md:col-span-2">
              <Combobox
                id="relatedDocumentId"
                options={invoiceOptions}
                value={relatedId ?? null}
                onSelect={(o) => onInvoiceChange(o.value)}
                placeholder="Search invoice number or client…"
                disabled={Boolean(documentId)}
                invalid={Boolean(errors.relatedDocumentId)}
              />
            </Field>
          ) : (
            <Field label="Client" htmlFor="clientId" required error={errorAt(errors, "clientId")} className="md:col-span-2">
              <Combobox
                id="clientId"
                options={clientOptions}
                value={clientId || null}
                onSelect={(o) => onClientChange(o.value)}
                placeholder="Search clients…"
                invalid={Boolean(errors.clientId)}
                footer={
                  canCreateClients ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setNewClientOpen(true)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <UserPlus className="size-4" /> New client
                    </button>
                  ) : null
                }
              />
            </Field>
          )}
          {!schedule ? (
            <Field label={type === "quote" ? "Quote date" : "Date"} htmlFor="issueDate" required error={errorAt(errors, "issueDate")}>
              <Input id="issueDate" type="date" value={issueDate ?? ""} onChange={(e) => onIssueDateChange(e.target.value)} />
            </Field>
          ) : null}
          {!schedule && (type === "invoice" || type === "debit_note") ? (
            <Field
              label="Due date"
              htmlFor="dueDate"
              error={errorAt(errors, "dueDate")}
              hint={termsDays !== null ? (termsDays === 0 ? "Due on receipt" : `Net ${termsDays}`) : undefined}
            >
              <div className="flex gap-1">
                <Input id="dueDate" type="date" {...register("dueDate")} />
                <Select
                  aria-label="Payment terms"
                  className="w-20 shrink-0 px-2"
                  value=""
                  onChange={(e) => {
                    if (e.target.value !== "" && issueDate) setValue("dueDate", addDays(issueDate, Number(e.target.value)), { shouldDirty: true });
                  }}
                >
                  <option value="">Net…</option>
                  {TERMS_PRESETS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? "On receipt" : `Net ${d}`}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          ) : null}
          {type === "quote" ? (
            <Field label="Valid until" htmlFor="validUntil" error={errorAt(errors, "validUntil")}>
              <Input id="validUntil" type="date" {...register("validUntil")} />
            </Field>
          ) : null}
          {isNote ? (
            <Field label="Reason" htmlFor="noteReason" required error={errorAt(errors, "noteReason")}>
              <Select id="noteReason" {...register("noteReason")}>
                <option value="">Select…</option>
                {NOTE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Reference / PO number" htmlFor="reference" error={errorAt(errors, "reference")}>
            <Input id="reference" {...register("reference")} />
          </Field>
          <Field label="Subject" htmlFor="subject" hint="Internal label, e.g. “Retainer — October”" error={errorAt(errors, "subject")} className="lg:col-span-2">
            <Input id="subject" {...register("subject")} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tax & currency" description={supplyTypeLabel(ctx)} />
        <CardBody className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Place of supply" htmlFor="placeOfSupply" required error={errorAt(errors, "placeOfSupply")} hint={isNote ? "Same as the original invoice" : "Where the client is registered / located"}>
            {isNote ? (
              <Input id="placeOfSupply" value={invoice?.placeOfSupply ? placeOfSupplyLabel(invoice.placeOfSupply) : ""} disabled />
            ) : (
              <StateSelect id="placeOfSupply" includeForeign {...register("placeOfSupply")} />
            )}
          </Field>
          <Field label="Currency" htmlFor="currency" error={errorAt(errors, "currency")}>
            <CurrencySelect
              id="currency"
              disabled={isNote}
              {...register("currency", {
                onChange: (e) => {
                  if (e.target.value === "INR") setValue("exchangeRate", "1");
                  else if (getValues("exchangeRate") === "1") setValue("exchangeRate", "");
                },
              })}
            />
          </Field>
          {effectiveCurrency !== "INR" ? (
            <Field
              label={`Exchange rate (₹ per ${effectiveCurrency})`}
              htmlFor="exchangeRate"
              required
              error={errorAt(errors, "exchangeRate")}
              hint={fxNote ?? "Used for GST reporting in INR"}
            >
              <div className="flex gap-1">
                <Input id="exchangeRate" inputMode="decimal" disabled={isNote} {...register("exchangeRate")} />
                {!isNote ? (
                  <Button type="button" variant="outline" size="icon" onClick={fetchRate} title="Fetch today's reference rate" aria-label="Fetch exchange rate">
                    <RefreshCw />
                  </Button>
                ) : null}
              </div>
            </Field>
          ) : null}
          {zeroRated && ctx.gstEnabled && !isNote ? (
            <Field label={ctx.supplyType === "export" ? "Export type" : "SEZ supply"} htmlFor="exportTax" hint={!settings.hasLut && exportTax !== "igst" ? "Add your LUT ARN in Settings to issue under LUT" : undefined}>
              <Select id="exportTax" value={exportTax ?? "lut"} onChange={(e) => setValue("exportTax", e.target.value as ExportTax, { shouldDirty: true })}>
                <option value="lut">Without IGST (under LUT)</option>
                <option value="igst">With IGST (claim refund)</option>
              </Select>
            </Field>
          ) : null}
          {ctx.gstEnabled && !isNote && !zeroRated ? (
            <div className="flex items-end pb-2">
              <Checkbox label="Tax payable on reverse charge" {...register("reverseCharge")} />
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Items" />
        <div className="hidden grid-cols-[minmax(0,1fr)_88px_72px_96px_110px_120px_84px_104px_64px] gap-2 border-b border-zinc-100 px-5 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500 xl:grid">
          <span>Item</span>
          <span>HSN/SAC</span>
          <span className="text-right">Qty</span>
          <span>Unit</span>
          <span className="text-right">Rate</span>
          <span>Discount</span>
          <span>GST</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        <div className="divide-y divide-zinc-100">
          {lines.fields.map((field, index) => (
            <LineRow
              key={field.id}
              index={index}
              form={form}
              itemOptions={itemOptions}
              items={items}
              amount={calc.lines[index]?.total ?? "0"}
              currency={effectiveCurrency}
              taxable={ctx.split !== "none"}
              canRemove={lines.fields.length > 1}
              onRemove={() => lines.remove(index)}
              onMoveUp={index > 0 ? () => lines.move(index, index - 1) : undefined}
              onMoveDown={index < lines.fields.length - 1 ? () => lines.move(index, index + 1) : undefined}
            />
          ))}
        </div>
        {errors.lines?.root?.message || errors.lines?.message ? (
          <p className="px-5 pt-2 text-xs text-red-600">{errors.lines?.root?.message ?? errors.lines?.message}</p>
        ) : null}
        <div className="px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={() => lines.append(emptyLine())}>
            <Plus /> Add line
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardBody className="grid gap-4">
            <Field label="Notes" htmlFor="notes" hint="Shown on the document" error={errorAt(errors, "notes")}>
              <Textarea id="notes" rows={3} {...register("notes")} />
            </Field>
            <Field label="Terms & conditions" htmlFor="terms" error={errorAt(errors, "terms")}>
              <Textarea id="terms" rows={4} {...register("terms")} />
            </Field>
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardBody className="flex flex-col gap-2 text-sm">
            {Number(calc.discountTotal) > 0 ? (
              <>
                <TotalLine label="Sub total" value={formatMoney(calc.subtotal, effectiveCurrency)} />
                <TotalLine label="Discount" value={`– ${formatMoney(calc.discountTotal, effectiveCurrency)}`} />
              </>
            ) : null}
            <TotalLine label={ctx.split === "none" ? "Sub total" : "Taxable value"} value={formatMoney(calc.taxableTotal, effectiveCurrency)} />
            {ctx.split === "cgst_sgst" ? (
              <>
                <TotalLine label="CGST" value={formatMoney(calc.cgstTotal, effectiveCurrency)} />
                <TotalLine label="SGST" value={formatMoney(calc.sgstTotal, effectiveCurrency)} />
              </>
            ) : null}
            {ctx.split === "igst" ? <TotalLine label="IGST" value={formatMoney(calc.igstTotal, effectiveCurrency)} /> : null}
            {reverseCharge && ctx.gstEnabled && !isNote ? <TotalLine label="Payable by recipient (RCM)" value={`(${formatMoney(calc.taxTotal, effectiveCurrency)})`} /> : null}
            {Number(calc.roundOff) !== 0 ? <TotalLine label="Round off" value={formatMoney(calc.roundOff, effectiveCurrency)} /> : null}
            <div className="mt-1 flex items-baseline justify-between border-t border-zinc-200 pt-3">
              <span className="font-semibold text-zinc-900">Total</span>
              <span className="text-lg font-semibold tabular text-zinc-900">{formatMoney(calc.total, effectiveCurrency)}</span>
            </div>
            <p className="text-xs text-zinc-500">{amountInWords(calc.total, effectiveCurrency)}</p>
          </CardBody>
        </Card>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <span className="mr-auto hidden text-xs text-zinc-500 sm:block">
          {schedule
            ? "Use {MONTH} or {YEAR} in text to insert the invoice's month, e.g. “Retainer — {MONTH}”."
            : `${type === "quote" ? "Quotes" : "Documents"} get their number when issued. Issued documents are locked.`}
        </span>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        {schedule ? (
          <Button type="button" onClick={submitSchedule} loading={pending} disabled={pending}>
            Save schedule
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={() => submit("draft")} loading={pending && submitMode === "draft"} disabled={pending}>
              Save draft
            </Button>
            <Button type="button" onClick={() => submit("issue")} loading={pending && submitMode === "issue"} disabled={pending}>
              Save & issue
            </Button>
          </>
        )}
      </div>

      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent title="New client" size="lg">
          <ClientForm
            compact
            clientId={null}
            defaults={clientDefaults(null, { currency: settings.defaultCurrency })}
            onSaved={(saved) => {
              setNewClientOpen(false);
              setClients((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
              // State updates above apply before this runs.
              setTimeout(() => onClientChange(saved.id, saved), 0);
            }}
          />
        </DialogContent>
      </Dialog>
    </form>
  );
}

function LineRow({
  index,
  form,
  itemOptions,
  items,
  amount,
  currency,
  taxable,
  canRemove,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  form: UseFormReturn<DocumentInputValues>;
  itemOptions: ComboOption[];
  items: EditorItem[];
  amount: string;
  currency: string;
  taxable: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { register, setValue, control, formState } = form;
  const [name, discountType, itemId] = useWatch({ control, name: [`lines.${index}.name`, `lines.${index}.discountType`, `lines.${index}.itemId`] });
  const e = (field: string) => errorAt(formState.errors, `lines.${index}.${field}`);

  function pick(option: ComboOption) {
    const item = items.find((i) => i.id === option.value);
    if (!item) return;
    const set = (k: keyof LineInputValues, v: string | null) => setValue(`lines.${index}.${k}` as const, v as never, { shouldDirty: true, shouldValidate: k === "name" });
    set("itemId", item.id);
    set("name", item.name);
    set("description", item.description);
    set("hsnSac", item.hsnSac);
    set("unit", item.unit);
    set("rate", item.rate);
    set("gstRate", String(Number(item.gstRate)));
  }

  return (
    <div className="grid grid-cols-2 gap-2 px-5 py-3 sm:grid-cols-4 xl:grid-cols-[minmax(0,1fr)_88px_72px_96px_110px_120px_84px_104px_64px] xl:items-start">
      <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-4 xl:col-span-1">
        <Combobox
          options={itemOptions}
          value={itemId ?? null}
          onSelect={pick}
          freeText
          inputValue={name ?? ""}
          onInputChange={(text) => {
            setValue(`lines.${index}.name`, text, { shouldDirty: true, shouldValidate: Boolean(e("name")) });
            if (itemId) setValue(`lines.${index}.itemId`, null);
          }}
          placeholder="Item or service"
          invalid={Boolean(e("name"))}
          id={`line-${index}-name`}
        />
        {e("name") ? <p className="text-xs text-red-600">{e("name")}</p> : null}
        <Textarea rows={1} placeholder="Description (optional)" className="field-sizing-content min-h-9 max-h-40 text-[13px]" {...register(`lines.${index}.description`)} />
      </div>
      <LineField label="HSN/SAC" error={e("hsnSac")}>
        <Input inputMode="numeric" placeholder="998314" {...register(`lines.${index}.hsnSac`)} aria-invalid={Boolean(e("hsnSac"))} />
      </LineField>
      <LineField label="Qty" error={e("quantity")}>
        <Input inputMode="decimal" className="text-right" {...register(`lines.${index}.quantity`)} aria-invalid={Boolean(e("quantity"))} />
      </LineField>
      <LineField label="Unit">
        <UnitSelect compact className="px-2" {...register(`lines.${index}.unit`)} />
      </LineField>
      <LineField label="Rate" error={e("rate")}>
        <Input inputMode="decimal" className="text-right" placeholder="0.00" {...register(`lines.${index}.rate`)} aria-invalid={Boolean(e("rate"))} />
      </LineField>
      <LineField label="Discount" error={e("discountValue")}>
        <div className="flex">
          <Input inputMode="decimal" className="rounded-r-none text-right" placeholder="0" {...register(`lines.${index}.discountValue`)} />
          <button
            type="button"
            className="h-9 w-10 shrink-0 rounded-r-md border border-l-0 border-zinc-300 bg-zinc-50 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
            onClick={() => setValue(`lines.${index}.discountType`, discountType === "percent" ? "amount" : "percent", { shouldDirty: true })}
            title="Switch between % and amount"
          >
            {discountType === "percent" ? "%" : currency === "INR" ? "₹" : currency}
          </button>
        </div>
      </LineField>
      <LineField label="GST" error={e("gstRate")}>
        <GstRateSelect className={cn("px-2", !taxable && "text-zinc-400")} {...register(`lines.${index}.gstRate`)} />
      </LineField>
      <div className="flex flex-col justify-center sm:items-end xl:h-9">
        <span className="text-xs text-zinc-500 xl:hidden">Amount</span>
        <span className="text-sm font-medium tabular text-zinc-900">{formatAmount(amount, currency)}</span>
      </div>
      <div className="flex items-center justify-end gap-0.5 xl:h-9">
        {onMoveUp ? (
          <button type="button" onClick={onMoveUp} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Move up">
            <ArrowUp className="size-3.5" />
          </button>
        ) : null}
        {onMoveDown ? (
          <button type="button" onClick={onMoveDown} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Move down">
            <ArrowDown className="size-3.5" />
          </button>
        ) : null}
        {canRemove ? (
          <button type="button" onClick={onRemove} className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ScheduleCard({ schedule, onChange, editing }: { schedule: ScheduleInput; onChange: (s: ScheduleInput) => void; editing: boolean }) {
  const set = <K extends keyof ScheduleInput>(key: K, value: ScheduleInput[K]) => onChange({ ...schedule, [key]: value });
  return (
    <Card>
      <CardHeader title="Schedule" description="The daily job creates an invoice on each run date." />
      <CardBody className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Name" htmlFor="schedule-name" required className="lg:col-span-2">
          <Input id="schedule-name" value={schedule.name} placeholder="Monthly retainer" onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Repeats" htmlFor="schedule-frequency">
          <Select id="schedule-frequency" value={schedule.frequency} onChange={(e) => set("frequency", e.target.value as ScheduleInput["frequency"])}>
            {RECURRING_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment terms (days)" htmlFor="schedule-terms">
          <Input id="schedule-terms" type="number" min={0} max={365} value={String(schedule.paymentTermsDays ?? "")} onChange={(e) => set("paymentTermsDays", e.target.value)} />
        </Field>
        <Field label={editing ? "Next invoice on" : "First invoice on"} htmlFor="schedule-start" required>
          <Input id="schedule-start" type="date" value={schedule.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="End date" htmlFor="schedule-end" hint="Optional">
          <Input id="schedule-end" type="date" value={schedule.endDate ?? ""} onChange={(e) => set("endDate", e.target.value || null)} />
        </Field>
        <Field label="Number of invoices" htmlFor="schedule-max" hint="Optional limit">
          <Input id="schedule-max" type="number" min={1} value={String(schedule.maxOccurrences ?? "")} onChange={(e) => set("maxOccurrences", e.target.value)} />
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <Checkbox label="Issue automatically" checked={schedule.autoIssue} onChange={(e) => onChange({ ...schedule, autoIssue: e.target.checked, autoSend: e.target.checked && schedule.autoSend })} />
          <Checkbox label="Email to client" checked={schedule.autoSend} disabled={!schedule.autoIssue} onChange={(e) => set("autoSend", e.target.checked)} />
        </div>
      </CardBody>
    </Card>
  );
}

function LineField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 xl:hidden">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular text-zinc-900">{value}</span>
    </div>
  );
}

function safeNum(value: unknown): string {
  const s = String(value ?? "").replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? s : "0";
}

function daysDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}
