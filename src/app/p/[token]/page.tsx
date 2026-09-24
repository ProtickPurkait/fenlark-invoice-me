import { CircleCheck, Download } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import QRCode from "qrcode";
import { PayOnlineButton, QuoteResponse } from "@/components/public/public-actions";
import { PublicShell } from "@/components/public/public-shell";
import { Badge } from "@/components/ui/badge";
import { Alert, Card, CardBody } from "@/components/ui/card";
import { logActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth/session";
import { countryName } from "@/lib/countries";
import { formatDate, todayIST } from "@/lib/dates";
import { markViewed } from "@/lib/documents/service";
import { DOC_LABELS, displayStatus, documentTitle } from "@/lib/documents/types";
import { gatewayFor } from "@/lib/gateways/service";
import { dec, formatAmount, formatMoney, formatQty } from "@/lib/money";
import { publicDocument } from "@/lib/public/queries";
import { businessName, loadSettings, logoUrl } from "@/lib/settings";
import { placeOfSupplyLabel, stateName } from "@/lib/tax/gst";
import { upiUri } from "@/lib/upi";

export const metadata: Metadata = { title: "Document", robots: { index: false, follow: false } };

export default async function PublicDocumentPage(props: PageProps<"/p/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const data = await publicDocument(token);
  if (!data) notFound();
  const { doc, lines, related } = data;
  const settings = await loadSettings();
  const seller = doc.sellerSnapshot!;
  const client = doc.clientSnapshot!;
  const cur = doc.currency;
  const today = todayIST();
  const title = documentTitle(doc.type, seller.gstRegistration);
  const status = displayStatus(doc, today);
  const isInvoice = doc.type === "invoice";
  const balance = dec(doc.balanceDue);
  const payable = isInvoice && (doc.status === "issued" || doc.status === "partially_paid") && balance.greaterThan(0);
  const gateway = payable ? await gatewayFor(cur, settings) : null;
  const upi =
    payable && cur === "INR" && seller.upiId
      ? upiUri({ upiId: seller.upiId, payeeName: seller.upiPayeeName || seller.tradeName || seller.legalName, amount: balance.toFixed(2), note: `${title} ${doc.number}` })
      : null;
  const upiQr = upi ? await QRCode.toDataURL(upi, { margin: 1, width: 320 }) : null;
  const quoteOpen = doc.type === "quote" && doc.status === "issued" && (!doc.validUntil || doc.validUntil >= today);

  // Record the first view by the client (not by staff previewing the link).
  if (!doc.viewedAt) {
    const staff = await getCurrentUser();
    if (!staff) {
      after(async () => {
        if (await markViewed(doc.id)) {
          await logActivity(
            { type: "client", id: doc.clientId, label: client.name },
            { entityType: "document", entityId: doc.id, action: "view", summary: `${client.name} viewed ${DOC_LABELS[doc.type].singular.toLowerCase()} ${doc.number}` },
          );
        }
      });
    }
  }

  return (
    <PublicShell brandName={businessName(settings)} logoUrl={logoUrl(settings)}>
      {sp.paid ? (
        <Alert tone="success" title="Thank you for your payment" className="mb-6">
          We&apos;ll confirm it here as soon as the payment provider notifies us — usually within a minute.
        </Alert>
      ) : null}
      {doc.status === "void" ? (
        <Alert tone="danger" title="This document has been cancelled" className="mb-6">
          It&apos;s no longer valid. Please contact {seller.email || businessName(settings)} if you have questions.
        </Alert>
      ) : null}

      <Card>
        <CardBody className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-zinc-500">{title}</p>
              <h1 className="mt-0.5 flex items-center gap-3 text-2xl font-semibold tracking-tight text-zinc-900">
                {doc.number}
                <Badge tone={status.tone}>{status.label}</Badge>
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {formatDate(doc.issueDate)}
                {isInvoice && doc.dueDate ? ` · Due ${formatDate(doc.dueDate)}` : ""}
                {doc.type === "quote" && doc.validUntil ? ` · Valid until ${formatDate(doc.validUntil)}` : ""}
                {related?.number ? (isInvoice ? ` · From quote ${related.number}` : ` · Against invoice ${related.number}`) : ""}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm text-zinc-500">{payable ? "Amount due" : "Total"}</p>
              <p className="text-3xl font-semibold tabular text-zinc-900">{formatMoney(payable ? balance.toFixed(2) : doc.total, cur)}</p>
              {payable && !balance.equals(doc.total) ? <p className="text-xs text-zinc-500">of {formatMoney(doc.total, cur)}</p> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {payable && gateway ? <PayOnlineButton token={token} label={`Pay ${formatMoney(balance.toFixed(2), cur)} online`} /> : null}
            {quoteOpen ? <QuoteResponse token={token} /> : null}
            <a
              href={`/p/${token}/pdf`}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              <Download className="size-4" /> Download PDF
            </a>
          </div>
          {doc.type === "quote" && doc.status === "accepted" ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CircleCheck className="size-4" /> You accepted this quote. We&apos;ll be in touch with the invoice.
            </p>
          ) : null}
          {isInvoice && doc.status === "paid" ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CircleCheck className="size-4" /> Paid in full — thank you!
            </p>
          ) : null}

          <div className="grid gap-6 border-t border-zinc-100 pt-6 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">From</p>
              <p className="font-medium text-zinc-900">{seller.legalName}</p>
              <p className="text-zinc-600">{[seller.addressLine1, seller.addressLine2, seller.city, stateName(seller.stateCode)].filter(Boolean).join(", ")}</p>
              {seller.gstin ? <p className="text-zinc-600">GSTIN {seller.gstin}</p> : null}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Billed to</p>
              <p className="font-medium text-zinc-900">{client.name}</p>
              <p className="text-zinc-600">
                {[client.addressLine1, client.addressLine2, client.city, client.country === "IN" ? stateName(client.stateCode) : countryName(client.country)].filter(Boolean).join(", ")}
              </p>
              {client.gstin ? <p className="text-zinc-600">GSTIN {client.gstin}</p> : null}
              {doc.placeOfSupply ? <p className="text-zinc-500">Place of supply: {placeOfSupplyLabel(doc.placeOfSupply)}</p> : null}
            </div>
          </div>

          <div className="overflow-x-auto border-t border-zinc-100 pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 text-right font-medium">Qty</th>
                  <th className="py-2 pr-3 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-zinc-900">{l.name}</p>
                      {l.description ? <p className="text-xs text-zinc-500">{l.description}</p> : null}
                    </td>
                    <td className="py-3 pr-3 text-right tabular text-zinc-700">{formatQty(l.quantity)}</td>
                    <td className="py-3 pr-3 text-right tabular text-zinc-700">{formatAmount(l.rate, cur)}</td>
                    <td className="py-3 text-right tabular text-zinc-900">{formatAmount(l.taxable, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto mt-4 flex max-w-xs flex-col gap-1.5 text-sm">
              <Line label="Taxable value" value={formatMoney(doc.taxableTotal, cur)} />
              {dec(doc.cgstTotal).greaterThan(0) ? <Line label="CGST" value={formatMoney(doc.cgstTotal, cur)} /> : null}
              {dec(doc.sgstTotal).greaterThan(0) ? <Line label="SGST" value={formatMoney(doc.sgstTotal, cur)} /> : null}
              {dec(doc.igstTotal).greaterThan(0) ? <Line label="IGST" value={formatMoney(doc.igstTotal, cur)} /> : null}
              {dec(doc.roundOff).isZero() ? null : <Line label="Round off" value={formatMoney(doc.roundOff, cur)} />}
              <div className="mt-1 flex justify-between border-t border-zinc-200 pt-2 font-semibold text-zinc-900">
                <span>Total</span>
                <span className="tabular">{formatMoney(doc.total, cur)}</span>
              </div>
              {isInvoice && dec(doc.amountPaid).plus(doc.tdsAmount).plus(doc.creditedTotal).greaterThan(0) ? (
                <>
                  {dec(doc.creditedTotal).greaterThan(0) ? <Line label="Credit notes" value={`– ${formatMoney(doc.creditedTotal, cur)}`} /> : null}
                  {dec(doc.amountPaid).greaterThan(0) ? <Line label="Paid" value={`– ${formatMoney(doc.amountPaid, cur)}`} /> : null}
                  {dec(doc.tdsAmount).greaterThan(0) ? <Line label="TDS" value={`– ${formatMoney(doc.tdsAmount, cur)}`} /> : null}
                  <div className="flex justify-between font-semibold text-zinc-900">
                    <span>Balance due</span>
                    <span className="tabular">{formatMoney(balance.isNegative() ? 0 : balance.toFixed(2), cur)}</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>

      {payable && (upiQr || seller.bankAccountNumber) ? (
        <Card className="mt-6">
          <CardBody className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
            {seller.bankAccountNumber ? (
              <div className="text-sm">
                <p className="mb-2 font-semibold text-zinc-900">Pay by bank transfer</p>
                <dl className="grid grid-cols-[120px_1fr] gap-y-1">
                  <dt className="text-zinc-500">Account name</dt>
                  <dd className="text-zinc-900">{seller.bankAccountName || seller.legalName}</dd>
                  <dt className="text-zinc-500">Bank</dt>
                  <dd className="text-zinc-900">{[seller.bankName, seller.bankBranch].filter(Boolean).join(", ")}</dd>
                  <dt className="text-zinc-500">Account no.</dt>
                  <dd className="font-mono text-zinc-900">{seller.bankAccountNumber}</dd>
                  <dt className="text-zinc-500">IFSC</dt>
                  <dd className="font-mono text-zinc-900">{seller.bankIfsc}</dd>
                  {cur !== "INR" && seller.bankSwift ? (
                    <>
                      <dt className="text-zinc-500">SWIFT</dt>
                      <dd className="font-mono text-zinc-900">{seller.bankSwift}</dd>
                    </>
                  ) : null}
                </dl>
                <p className="mt-3 text-xs text-zinc-500">Please mention {doc.number} as the payment reference.</p>
              </div>
            ) : null}
            {upiQr && upi ? (
              <div className="flex items-center gap-4 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={upiQr} alt="UPI QR code" className="size-36 rounded-md border border-zinc-200" />
                <div>
                  <p className="font-semibold text-zinc-900">Scan to pay with UPI</p>
                  <p className="text-zinc-500">{seller.upiId}</p>
                  <a href={upi} className="mt-3 inline-flex rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white sm:hidden">
                    Open UPI app
                  </a>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {doc.notes || doc.terms ? (
        <div className="mt-6 grid gap-4 text-sm text-zinc-600 sm:grid-cols-2">
          {doc.notes ? <p className="whitespace-pre-line">{doc.notes}</p> : null}
          {doc.terms ? <p className="whitespace-pre-line text-xs text-zinc-500">{doc.terms}</p> : null}
        </div>
      ) : null}
    </PublicShell>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-zinc-600">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
