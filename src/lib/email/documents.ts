import "server-only";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { logActivity, type Actor } from "@/lib/activity";
import { daysBetween, formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { clients, documents, payments, type BusinessSettings, type Client, type DocumentRow } from "@/lib/db/schema";
import { markSent } from "@/lib/documents/service";
import { documentTitle } from "@/lib/documents/types";
import { appUrl } from "@/lib/env";
import { UserError } from "@/lib/errors";
import { dec, formatMoney } from "@/lib/money";
import { renderDocumentPdf } from "@/lib/pdf/render";
import { businessName, emailBrand, loadSettings } from "@/lib/settings";
import { BrandedEmail } from "@/emails/branded-email";
import { sendEmail, type SendEmailResult } from "./send";

export function publicUrl(doc: Pick<DocumentRow, "publicToken">): string | null {
  return doc.publicToken ? appUrl(`/p/${doc.publicToken}`) : null;
}

function greeting(client: Pick<Client, "contactName" | "name">): string {
  const name = client.contactName || client.name;
  return `Hi ${name.split(/\s+/)[0]},`;
}

function titleOf(doc: DocumentRow, settings: BusinessSettings): string {
  return documentTitle(doc.type, doc.sellerSnapshot?.gstRegistration ?? settings.gstRegistration);
}

export interface EmailDraft {
  to: string[];
  cc: string[];
  subject: string;
  message: string;
}

/** Pre-filled content for the "Send" dialog. */
export function defaultDocumentEmail(doc: DocumentRow, client: Client, settings: BusinessSettings, related?: DocumentRow | null): EmailDraft {
  const biz = businessName(settings);
  const title = titleOf(doc, settings);
  const amount = formatMoney(doc.type === "invoice" && doc.status !== "issued" ? doc.balanceDue : doc.total, doc.currency);
  const lines: string[] = [greeting(client)];
  switch (doc.type) {
    case "invoice":
      lines.push(
        `Please find attached ${title.toLowerCase()} ${doc.number} for ${amount}${doc.dueDate ? `, due on ${formatDate(doc.dueDate)}` : ""}.`,
        "You can view the invoice and pay online using the button below.",
      );
      break;
    case "quote":
      lines.push(
        `Please find attached our quotation ${doc.number} for ${formatMoney(doc.total, doc.currency)}${doc.validUntil ? `, valid until ${formatDate(doc.validUntil)}` : ""}.`,
        "You can review and accept it online using the button below. Let us know if you have any questions.",
      );
      break;
    case "credit_note":
      lines.push(`Please find attached credit note ${doc.number} for ${formatMoney(doc.total, doc.currency)}${related?.number ? ` against invoice ${related.number}` : ""}.`);
      break;
    case "debit_note":
      lines.push(`Please find attached debit note ${doc.number} for ${formatMoney(doc.total, doc.currency)}${related?.number ? ` against invoice ${related.number}` : ""}.`);
      break;
  }
  lines.push(`Thanks,\n${biz}`);
  return {
    to: client.email ? [client.email] : [],
    cc: client.ccEmails,
    subject: `${title} ${doc.number} from ${biz}`,
    message: lines.join("\n\n"),
  };
}

function summaryRows(doc: DocumentRow, title: string) {
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: title, value: doc.number ?? "" },
    { label: "Date", value: formatDate(doc.issueDate) },
  ];
  if (doc.type === "invoice" && doc.dueDate) rows.push({ label: "Due date", value: formatDate(doc.dueDate) });
  if (doc.type === "quote" && doc.validUntil) rows.push({ label: "Valid until", value: formatDate(doc.validUntil) });
  rows.push({ label: "Amount", value: formatMoney(doc.total, doc.currency), strong: doc.type !== "invoice" });
  if (doc.type === "invoice" && dec(doc.balanceDue).lessThan(doc.total)) {
    rows.push({ label: "Balance due", value: formatMoney(dec(doc.balanceDue).isNegative() ? 0 : doc.balanceDue, doc.currency), strong: true });
  } else if (doc.type === "invoice") {
    rows[rows.length - 1].strong = true;
  }
  return rows;
}

function ctaFor(doc: DocumentRow): { label: string; url: string } | undefined {
  const url = publicUrl(doc);
  if (!url) return undefined;
  if (doc.type === "invoice") return { label: dec(doc.balanceDue).greaterThan(0) ? "View & pay invoice" : "View invoice", url };
  if (doc.type === "quote") return { label: "Review quote", url };
  return { label: "View document", url };
}

export async function sendDocumentEmail(opts: {
  documentId: string;
  to: string[];
  cc: string[];
  subject: string;
  message: string;
  attachPdf: boolean;
  actor: Actor;
}): Promise<SendEmailResult> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, opts.documentId));
  if (!doc) throw new UserError("Document not found");
  if (doc.status === "draft") throw new UserError("Issue the document before sending it");
  if (doc.status === "void") throw new UserError("This document is void");
  if (opts.to.length === 0) throw new UserError("Add at least one recipient", { to: "Required" });

  const settings = await loadSettings();
  const title = titleOf(doc, settings);
  const attachments = [];
  if (opts.attachPdf) {
    const pdf = await renderDocumentPdf(doc.id);
    attachments.push({ filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" });
  }

  const result = await sendEmail({
    kind: "document",
    to: opts.to,
    cc: opts.cc,
    bcc: settings.bccEmail ? [settings.bccEmail] : [],
    replyTo: settings.email || undefined,
    subject: opts.subject,
    documentId: doc.id,
    createdBy: opts.actor.type === "user" ? opts.actor.id : null,
    attachments,
    react: createElement(BrandedEmail, {
      brand: emailBrand(settings),
      preview: `${title} ${doc.number} — ${formatMoney(doc.total, doc.currency)}`,
      message: opts.message,
      summary: summaryRows(doc, title),
      cta: ctaFor(doc),
    }),
  });

  if (result.status !== "failed") {
    await markSent(doc.id);
    await logActivity(opts.actor, {
      entityType: "document",
      entityId: doc.id,
      action: "email",
      summary: `${result.status === "sent" ? "Emailed" : "Logged (email not configured)"} ${title.toLowerCase()} ${doc.number} to ${opts.to.join(", ")}`,
    });
  }
  return result;
}

export async function sendPaymentReceipt(paymentId: string, userId: string | null): Promise<SendEmailResult> {
  const [row] = await db
    .select({ payment: payments, doc: documents, client: clients })
    .from(payments)
    .innerJoin(documents, eq(documents.id, payments.documentId))
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(eq(payments.id, paymentId));
  if (!row) throw new UserError("Payment not found");
  const { payment, doc, client } = row;
  if (!client.email) return { status: "skipped", error: "Client has no email address" };

  const settings = await loadSettings();
  const biz = businessName(settings);
  const cur = doc.currency;
  const summary = [
    { label: "Invoice", value: doc.number ?? "" },
    { label: "Payment date", value: formatDate(payment.date) },
    { label: "Amount received", value: formatMoney(payment.amount, cur), strong: true },
  ];
  if (dec(payment.tdsAmount).greaterThan(0)) summary.push({ label: `TDS deducted${payment.tdsSection ? ` (${payment.tdsSection})` : ""}`, value: formatMoney(payment.tdsAmount, cur), strong: false });
  summary.push({
    label: "Balance due",
    value: formatMoney(dec(doc.balanceDue).isNegative() ? 0 : doc.balanceDue, cur),
    strong: false,
  });

  const fullyPaid = dec(doc.balanceDue).lessThanOrEqualTo(0);
  return sendEmail({
    kind: "receipt",
    to: [client.email],
    cc: client.ccEmails,
    bcc: settings.bccEmail ? [settings.bccEmail] : [],
    replyTo: settings.email || undefined,
    subject: `Payment received for invoice ${doc.number} — thank you`,
    documentId: doc.id,
    createdBy: userId,
    react: createElement(BrandedEmail, {
      brand: emailBrand(settings),
      preview: `We received ${formatMoney(payment.amount, cur)} for invoice ${doc.number}`,
      message: `${greeting(client)}\n\nThank you — we've received your payment of ${formatMoney(payment.amount, cur)} for invoice ${doc.number}.${fullyPaid ? " The invoice is now fully paid." : ""}\n\nRegards,\n${biz}`,
      summary,
      cta: publicUrl(doc) ? { label: "View invoice", url: publicUrl(doc)! } : undefined,
    }),
  });
}

export function reminderCopy(doc: DocumentRow, client: Client, settings: BusinessSettings, today: string): { subject: string; message: string } {
  const biz = businessName(settings);
  const balance = formatMoney(doc.balanceDue, doc.currency);
  const due = doc.dueDate ? formatDate(doc.dueDate) : "";
  const days = doc.dueDate ? daysBetween(doc.dueDate, today) : 0;
  let subject: string;
  let body: string;
  if (days < 0) {
    subject = `Reminder: invoice ${doc.number} is due on ${due}`;
    body = `This is a friendly reminder that invoice ${doc.number} for ${balance} is due on ${due}.`;
  } else if (days === 0) {
    subject = `Invoice ${doc.number} is due today`;
    body = `Invoice ${doc.number} for ${balance} is due today.`;
  } else {
    subject = `Overdue: invoice ${doc.number} (${days} day${days === 1 ? "" : "s"})`;
    body = `Invoice ${doc.number} was due on ${due} and is now ${days} day${days === 1 ? "" : "s"} overdue. The outstanding balance is ${balance}.`;
  }
  return {
    subject,
    message: `${greeting(client)}\n\n${body}\n\nYou can view the invoice and pay online using the button below. If you've already paid, please ignore this email — thank you!\n\nRegards,\n${biz}`,
  };
}

export async function sendReminderEmail(doc: DocumentRow, client: Client, settings: BusinessSettings, today: string): Promise<SendEmailResult> {
  const { subject, message } = reminderCopy(doc, client, settings, today);
  const title = titleOf(doc, settings);
  const pdf = await renderDocumentPdf(doc.id);
  return sendEmail({
    kind: "reminder",
    to: [client.email],
    cc: client.ccEmails,
    bcc: settings.bccEmail ? [settings.bccEmail] : [],
    replyTo: settings.email || undefined,
    subject,
    documentId: doc.id,
    attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" }],
    react: createElement(BrandedEmail, {
      brand: emailBrand(settings),
      preview: subject,
      message,
      summary: summaryRows(doc, title),
      cta: ctaFor(doc),
    }),
  });
}
