import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, todayIST } from "@/lib/dates";
import { getDocumentDetail } from "@/lib/documents/queries";
import { profileProblems } from "@/lib/documents/service";
import { DOC_LABELS, NOTE_REASONS, displayStatus, documentPath, documentTitle, type DocumentType } from "@/lib/documents/types";
import { defaultDocumentEmail, publicUrl } from "@/lib/email/documents";
import { dec, formatMoney } from "@/lib/money";
import { loadSettings } from "@/lib/settings";
import { placeOfSupplyLabel } from "@/lib/tax/gst";
import { supplyTypeLabel, taxContext } from "@/lib/documents/tax-context";
import { DocumentActions } from "./document-actions";
import { PaymentList } from "./payment-list";

export async function DocumentDetailPage({ type, id }: { type: DocumentType; id: string }) {
  const user = await requireUser();
  const detail = await getDocumentDetail(id);
  if (!detail || detail.doc.type !== type) notFound();
  const { doc, client, lines, related, children, activity, emails } = detail;
  const settings = await loadSettings();
  const today = todayIST();
  const status = displayStatus(doc, today);
  const registration = doc.sellerSnapshot?.gstRegistration ?? settings.gstRegistration;
  const title = documentTitle(type, registration);
  const label = DOC_LABELS[type];
  const cur = doc.currency;
  const isInvoice = type === "invoice";
  const canWrite = can(user.role, "documents:write");
  const email = doc.status !== "draft" && doc.status !== "void" ? defaultDocumentEmail(doc, client, settings) : null;
  const ctx = taxContext({
    registration,
    sellerStateCode: doc.sellerSnapshot?.stateCode ?? settings.stateCode,
    placeOfSupply: doc.placeOfSupply,
    clientCountry: client.country,
    isSez: client.isSez,
    exportTax: doc.exportTax,
  });
  const problems = doc.status === "draft" ? profileProblems(settings) : [];

  return (
    <>
      <PageHeader
        back={
          <Link href={label.path} className="text-sm text-zinc-500 hover:text-zinc-800">
            ← {label.plural}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {title} {doc.number ?? "(draft)"}
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
        }
        description={
          <>
            <Link href={`/clients/${client.id}`} className="font-medium text-zinc-700 hover:text-brand-700">
              {client.name}
            </Link>{" "}
            · {formatMoney(doc.total, cur)} · {formatDate(doc.issueDate)}
            {doc.subject ? ` · ${doc.subject}` : ""}
          </>
        }
        actions={
          <DocumentActions
            doc={{
              id: doc.id,
              type: doc.type,
              status: doc.status,
              number: doc.number,
              currency: cur,
              total: doc.total,
              balanceDue: doc.balanceDue,
              taxableTotal: doc.taxableTotal,
              issueDate: doc.issueDate,
              publicUrl: publicUrl(doc),
            }}
            canWrite={canWrite}
            canPay={can(user.role, "payments:write")}
            email={email ? { to: email.to.join(", "), cc: email.cc.join(", "), subject: email.subject, message: email.message } : null}
            payment={{
              today,
              tdsRate: client.tdsApplicable ? client.tdsRate : null,
              tdsSection: client.tdsSection,
              sendReceipt: settings.sendPaymentReceipts,
              clientHasEmail: Boolean(client.email),
            }}
          />
        }
      />

      <div className="mb-6 flex flex-col gap-3">
        {doc.status === "draft" ? (
          <Alert tone="info" title="This is a draft">
            It gets a number and is locked when you issue it.{" "}
            {problems.length ? <>Before issuing, complete your business profile ({problems.join(", ")}) in <Link className="underline" href="/settings/business">Settings</Link>.</> : null}
          </Alert>
        ) : null}
        {doc.status === "void" ? (
          <Alert tone="danger" title={`Voided ${doc.voidedAt ? formatDateTime(doc.voidedAt) : ""}`}>
            {doc.voidReason}
          </Alert>
        ) : null}
        {isInvoice && status.label.startsWith("Overdue") && doc.dueDate ? (
          <Alert tone="warning" title="Overdue">
            Was due on {formatDate(doc.dueDate)}. Balance {formatMoney(doc.balanceDue, cur)}.
          </Alert>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <iframe
            src={`/api/documents/${doc.id}/pdf#view=FitH&toolbar=0`}
            title={`${title} preview`}
            className="h-[75vh] min-h-[600px] w-full bg-zinc-100"
          />
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Summary" />
            <CardBody className="flex flex-col gap-2 text-sm">
              <Row label={ctx.split === "none" ? "Sub total" : "Taxable value"} value={formatMoney(doc.taxableTotal, cur)} />
              {dec(doc.taxTotal).greaterThan(0) ? <Row label={doc.reverseCharge ? "GST (reverse charge)" : "GST"} value={formatMoney(doc.taxTotal, cur)} /> : null}
              <Row label="Total" value={formatMoney(doc.total, cur)} strong />
              {isInvoice && doc.status !== "draft" ? (
                <>
                  {dec(doc.debitedTotal).greaterThan(0) ? <Row label="Debit notes" value={`+ ${formatMoney(doc.debitedTotal, cur)}`} /> : null}
                  {dec(doc.creditedTotal).greaterThan(0) ? <Row label="Credit notes" value={`– ${formatMoney(doc.creditedTotal, cur)}`} /> : null}
                  {dec(doc.amountPaid).greaterThan(0) ? <Row label="Received" value={`– ${formatMoney(doc.amountPaid, cur)}`} /> : null}
                  {dec(doc.tdsAmount).greaterThan(0) ? <Row label="TDS" value={`– ${formatMoney(doc.tdsAmount, cur)}`} /> : null}
                  <div className="border-t border-zinc-100 pt-2">
                    <Row
                      label={dec(doc.balanceDue).isNegative() ? "Refund due to client" : "Balance due"}
                      value={formatMoney(dec(doc.balanceDue).abs().toFixed(2), cur)}
                      strong
                    />
                  </div>
                </>
              ) : null}
              <div className="mt-2 flex flex-col gap-1.5 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                {doc.placeOfSupply ? <span>Place of supply: {placeOfSupplyLabel(doc.placeOfSupply)}</span> : null}
                <span>{supplyTypeLabel(ctx)}</span>
                {cur !== "INR" ? <span>1 {cur} = ₹{Number(doc.exchangeRate).toFixed(4)}</span> : null}
                {doc.dueDate && (isInvoice || type === "debit_note") ? <span>Due {formatDate(doc.dueDate)}</span> : null}
                {doc.validUntil && type === "quote" ? <span>Valid until {formatDate(doc.validUntil)}</span> : null}
                {doc.reference ? <span>Reference: {doc.reference}</span> : null}
                {doc.noteReason ? <span>Reason: {NOTE_REASONS.find((r) => r.value === doc.noteReason)?.label}</span> : null}
                <span>{lines.length} line{lines.length === 1 ? "" : "s"}</span>
                {doc.sentAt ? <span>Sent {formatDateTime(doc.sentAt)}</span> : null}
                {doc.viewedAt ? <span>Viewed by client {formatDateTime(doc.viewedAt)}</span> : null}
              </div>
            </CardBody>
          </Card>

          {isInvoice && doc.status !== "draft" ? (
            <Card>
              <CardHeader title="Payments" />
              <CardBody>
                <PaymentList
                  currency={cur}
                  canDelete={can(user.role, "payments:write")}
                  payments={detail.payments.map((p) => ({
                    id: p.id,
                    kind: p.kind,
                    date: p.date,
                    amount: p.amount,
                    tdsAmount: p.tdsAmount,
                    tdsSection: p.tdsSection,
                    method: p.method,
                    reference: p.reference,
                    gateway: p.gateway,
                  }))}
                />
              </CardBody>
            </Card>
          ) : null}

          {related || children.length ? (
            <Card>
              <CardHeader title="Related" />
              <CardBody className="flex flex-col gap-2 text-sm">
                {related ? (
                  <RelatedLink doc={related} prefix={type === "invoice" ? "From quote" : "Against invoice"} />
                ) : null}
                {children.map((c) => (
                  <RelatedLink key={c.id} doc={c} prefix={DOC_LABELS[c.type].singular} />
                ))}
              </CardBody>
            </Card>
          ) : null}

          {emails.length ? (
            <Card>
              <CardHeader title="Emails" />
              <CardBody className="flex flex-col gap-2.5 text-sm">
                {emails.map((e) => (
                  <div key={e.id}>
                    <p className="text-zinc-800">
                      {e.kind === "reminder" ? "Reminder" : e.kind === "receipt" ? "Receipt" : "Sent"} to {e.to.join(", ")}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatDateTime(e.createdAt)} · {e.status === "sent" ? "delivered to provider" : e.status === "skipped" ? "not sent (email not configured)" : `failed: ${e.error}`}
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <ol className="relative flex flex-col gap-3 border-l border-zinc-200 pl-4 text-sm">
                {activity.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-zinc-300" />
                    <p className="text-zinc-800">{a.summary}</p>
                    <p className="text-xs text-zinc-500">
                      {a.actorLabel} · {formatDateTime(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className={strong ? "font-medium text-zinc-900" : "text-zinc-500"}>{label}</span>
      <span className={strong ? "font-semibold tabular text-zinc-900" : "tabular text-zinc-800"}>{value}</span>
    </div>
  );
}

function RelatedLink({ doc, prefix }: { doc: { id: string; type: DocumentType; number: string | null; status: string; total: string }; prefix: string }) {
  return (
    <Link href={documentPath(doc.type, doc.id)} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-50">
      <span>
        <span className="text-zinc-500">{prefix}</span> <span className="font-medium text-zinc-900">{doc.number ?? "Draft"}</span>
        {doc.status === "void" ? <span className="text-xs text-zinc-400"> (void)</span> : null}
      </span>
      <span className="tabular text-zinc-600">{Number(doc.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
    </Link>
  );
}
