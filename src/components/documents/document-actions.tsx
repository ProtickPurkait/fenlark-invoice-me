"use client";

import {
  Ban,
  Copy,
  Download,
  Ellipsis,
  FileCheck,
  FileMinus,
  FilePlus,
  Link2,
  Pencil,
  Send,
  Stamp,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  convertQuoteAction,
  deleteDraftAction,
  duplicateDocumentAction,
  issueDocumentAction,
  recordPaymentAction,
  respondQuoteAction,
  sendDocumentAction,
  voidDocumentAction,
} from "@/lib/documents/actions";
import { DOC_LABELS, PAYMENT_METHODS, documentPath, type DocumentStatus, type DocumentType } from "@/lib/documents/types";
import { dec, formatMoney } from "@/lib/money";
import { TDS_SECTIONS } from "@/lib/tax/gst";

export interface ActionDoc {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  number: string | null;
  currency: string;
  total: string;
  balanceDue: string;
  taxableTotal: string;
  issueDate: string;
  publicUrl: string | null;
}

export interface PaymentDefaults {
  today: string;
  tdsRate: string | null;
  tdsSection: string;
  sendReceipt: boolean;
  clientHasEmail: boolean;
}

export function DocumentActions({
  doc,
  canWrite,
  canPay,
  email,
  payment,
}: {
  doc: ActionDoc;
  canWrite: boolean;
  canPay: boolean;
  email: { to: string; cc: string; subject: string; message: string } | null;
  payment: PaymentDefaults;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"send" | "pay" | "void" | "delete" | null>(null);
  const label = DOC_LABELS[doc.type];
  const pdfUrl = `/api/documents/${doc.id}/pdf`;
  const isDraft = doc.status === "draft";
  const isVoid = doc.status === "void";
  const invoiceOpen = doc.type === "invoice" && (doc.status === "issued" || doc.status === "partially_paid");

  function run<T>(fn: () => Promise<{ ok: true; data: T; message?: string } | { ok: false; error: string }>, after?: (data: T) => void) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      after?.(result.data);
      router.refresh();
    });
  }

  function copyLink() {
    if (!doc.publicUrl) return;
    navigator.clipboard.writeText(doc.publicUrl).then(
      () => toast.success("Link copied — anyone with it can view this document"),
      () => toast.error("Couldn't copy"),
    );
  }

  const more = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More actions">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <a href={`${pdfUrl}?download=1`}>
            <Download /> Download PDF
          </a>
        </DropdownMenuItem>
        {doc.publicUrl && !isVoid ? (
          <DropdownMenuItem onSelect={copyLink}>
            <Link2 /> Copy share link
          </DropdownMenuItem>
        ) : null}
        {canWrite && (doc.type === "invoice" || doc.type === "quote") ? (
          <DropdownMenuItem onSelect={() => run(() => duplicateDocumentAction(doc.id), (d) => router.push(`${documentPath(doc.type, d.id)}/edit`))}>
            <Copy /> Duplicate
          </DropdownMenuItem>
        ) : null}
        {canWrite && doc.type === "quote" && (doc.status === "issued" || doc.status === "declined") ? (
          <DropdownMenuItem onSelect={() => run(() => respondQuoteAction(doc.id, "accepted"))}>
            <ThumbsUp /> Mark accepted
          </DropdownMenuItem>
        ) : null}
        {canWrite && doc.type === "quote" && (doc.status === "issued" || doc.status === "accepted") ? (
          <DropdownMenuItem onSelect={() => run(() => respondQuoteAction(doc.id, "declined"))}>
            <ThumbsDown /> Mark declined
          </DropdownMenuItem>
        ) : null}
        {canWrite && doc.type === "invoice" && !isDraft && !isVoid ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/credit-notes/new?invoice=${doc.id}`}>
                <FileMinus /> New credit note
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/debit-notes/new?invoice=${doc.id}`}>
                <FilePlus /> New debit note
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        {canWrite && !isDraft && !isVoid && doc.status !== "converted" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setDialog("void")}>
              <Ban /> Void {label.singular.toLowerCase()}
            </DropdownMenuItem>
          </>
        ) : null}
        {canWrite && isDraft ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setDialog("delete")}>
              <Trash2 /> Delete draft
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {isDraft && canWrite ? (
        <>
          <Button variant="outline" asChild>
            <Link href={`${documentPath(doc.type, doc.id)}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              run(
                () => issueDocumentAction(doc.id),
                (d) => toast.success(`Issued as ${d.number}`),
              )
            }
          >
            <Stamp /> Issue {label.singular.toLowerCase()}
          </Button>
        </>
      ) : null}
      {!isDraft && !isVoid && canWrite && email ? (
        <Button variant={invoiceOpen ? "outline" : "default"} onClick={() => setDialog("send")}>
          <Send /> Send
        </Button>
      ) : null}
      {invoiceOpen && canPay ? (
        <Button onClick={() => setDialog("pay")}>
          <Wallet /> Record payment
        </Button>
      ) : null}
      {canWrite && doc.type === "quote" && (doc.status === "issued" || doc.status === "accepted") ? (
        <Button variant={doc.status === "accepted" ? "default" : "outline"} loading={pending} onClick={() => run(() => convertQuoteAction(doc.id), (d) => router.push(`/invoices/${d.id}/edit`))}>
          <FileCheck /> Convert to invoice
        </Button>
      ) : null}
      {more}

      {email ? (
        <SendDialog open={dialog === "send"} onOpenChange={(o) => setDialog(o ? "send" : null)} doc={doc} defaults={email} />
      ) : null}
      <PaymentDialog open={dialog === "pay"} onOpenChange={(o) => setDialog(o ? "pay" : null)} doc={doc} defaults={payment} />
      <VoidDialog open={dialog === "void"} onOpenChange={(o) => setDialog(o ? "void" : null)} doc={doc} />
      <Dialog open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)}>
        <DialogContent title="Delete this draft?" description="This can't be undone." size="sm">
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                run(
                  () => deleteDraftAction(doc.id),
                  (d) => router.push(d.path),
                )
              }
            >
              Delete draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SendDialog({
  open,
  onOpenChange,
  doc,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: ActionDoc;
  defaults: { to: string; cc: string; subject: string; message: string };
}) {
  const router = useRouter();
  const [values, setValues] = useState({ ...defaults, attachPdf: true });
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Send ${DOC_LABELS[doc.type].singular.toLowerCase()} ${doc.number}`} size="lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await sendDocumentAction(doc.id, values);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(result.data.status === "sent" ? "Email sent" : "Email printed to the server log (email isn't configured yet)");
              onOpenChange(false);
              router.refresh();
            });
          }}
        >
          <Field label="To" htmlFor="send-to" hint="Separate multiple addresses with commas">
            <Input id="send-to" value={values.to} onChange={set("to")} required />
          </Field>
          <Field label="CC" htmlFor="send-cc">
            <Input id="send-cc" value={values.cc} onChange={set("cc")} />
          </Field>
          <Field label="Subject" htmlFor="send-subject">
            <Input id="send-subject" value={values.subject} onChange={set("subject")} required />
          </Field>
          <Field label="Message" htmlFor="send-message" hint="A button linking to the online copy is added below your message.">
            <Textarea id="send-message" rows={8} value={values.message} onChange={set("message")} required />
          </Field>
          <Checkbox label="Attach PDF" checked={values.attachPdf} onChange={set("attachPdf")} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              <Send /> Send email
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  doc,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: ActionDoc;
  defaults: PaymentDefaults;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const suggestedTds =
    defaults.tdsRate && dec(doc.balanceDue).equals(doc.total)
      ? dec(doc.taxableTotal).times(defaults.tdsRate).dividedBy(100).toDecimalPlaces(0).toFixed(2)
      : "";
  const initial = {
    date: defaults.today,
    amount: suggestedTds ? dec(doc.balanceDue).minus(suggestedTds).toFixed(2) : dec(doc.balanceDue).toFixed(2),
    tdsAmount: suggestedTds,
    tdsSection: defaults.tdsSection,
    method: "bank_transfer",
    reference: "",
    notes: "",
    sendReceipt: defaults.sendReceipt && defaults.clientHasEmail,
  };
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const settles = dec(safe(values.amount)).plus(safe(values.tdsAmount));
  const remaining = dec(doc.balanceDue).minus(settles);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setValues(initial);
        setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent title={`Record payment · ${doc.number}`} description={`Balance due ${formatMoney(doc.balanceDue, doc.currency)}`} size="lg">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await recordPaymentAction({ documentId: doc.id, kind: "payment", ...values, method: values.method as never });
              if (!result.ok) {
                setError(result.fieldErrors ? Object.values(result.fieldErrors)[0] : result.error);
                return;
              }
              toast.success(
                result.data.receipt === "sent"
                  ? "Payment recorded and receipt emailed"
                  : result.data.receipt === "skipped"
                    ? "Payment recorded (receipt printed to the server log)"
                    : "Payment recorded",
              );
              onOpenChange(false);
              router.refresh();
            });
          }}
        >
          <Field label="Payment date" htmlFor="pay-date">
            <Input id="pay-date" type="date" value={values.date} onChange={set("date")} required />
          </Field>
          <Field label="Method" htmlFor="pay-method">
            <Select id="pay-method" value={values.method} onChange={set("method")}>
              {PAYMENT_METHODS.filter((m) => m.value !== "gateway").map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Amount received (${doc.currency})`} htmlFor="pay-amount">
            <Input id="pay-amount" inputMode="decimal" value={values.amount} onChange={set("amount")} required />
          </Field>
          <Field label="TDS deducted by client" htmlFor="pay-tds" hint={defaults.tdsRate ? `Client deducts ${Number(defaults.tdsRate)}% on the taxable value` : "Leave blank if none"}>
            <Input id="pay-tds" inputMode="decimal" value={values.tdsAmount} onChange={set("tdsAmount")} placeholder="0.00" />
          </Field>
          {Number(values.tdsAmount) > 0 ? (
            <Field label="TDS section" htmlFor="pay-tds-section">
              <Select id="pay-tds-section" value={values.tdsSection} onChange={set("tdsSection")}>
                <option value="">Select…</option>
                {TDS_SECTIONS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Reference" htmlFor="pay-ref" hint="UTR, cheque or transaction number">
            <Input id="pay-ref" value={values.reference} onChange={set("reference")} />
          </Field>
          <Field label="Notes" htmlFor="pay-notes" className="sm:col-span-2">
            <Textarea id="pay-notes" rows={2} value={values.notes} onChange={set("notes")} />
          </Field>
          <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600 sm:col-span-2">
            Settles {formatMoney(settles.toFixed(2), doc.currency)} ·{" "}
            {remaining.lessThanOrEqualTo(0) ? (
              <span className="font-medium text-emerald-700">invoice fully paid</span>
            ) : (
              <span>{formatMoney(remaining.toFixed(2), doc.currency)} will remain due</span>
            )}
          </div>
          {defaults.clientHasEmail ? (
            <Checkbox className="sm:col-span-2" label="Email a receipt to the client" checked={values.sendReceipt} onChange={set("sendReceipt")} />
          ) : null}
          {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({ open, onOpenChange, doc }: { open: boolean; onOpenChange: (open: boolean) => void; doc: ActionDoc }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Void ${DOC_LABELS[doc.type].singular.toLowerCase()} ${doc.number}?`}
        description="The number stays used (GST requires a continuous series) and the document is marked VOID. Report it as cancelled when you file GSTR-1."
      >
        <Field label="Reason" htmlFor="void-reason">
          <Textarea id="void-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            disabled={!reason.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await voidDocumentAction(doc.id, reason);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Voided");
                onOpenChange(false);
                router.refresh();
              })
            }
          >
            <Ban /> Void
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function safe(v: string): string {
  return /^\d+(\.\d+)?$/.test(v.trim()) ? v.trim() : "0";
}
