"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { userActor } from "@/lib/activity";
import { requirePermission } from "@/lib/auth/session";
import { runAction, UserError, type ActionResult } from "@/lib/errors";
import { fetchInrRate, type FxRate } from "@/lib/fx";
import { currencyField, dateString } from "@/lib/validation/common";
import type { DocumentInputValues, PaymentInputValues } from "@/lib/validation/document";
import { deletePayment, recordPayment } from "@/lib/payments/service";
import { sendDocumentEmail, sendPaymentReceipt } from "@/lib/email/documents";
import { isValidEmail, parseEmailList } from "@/lib/email/send";
import {
  convertQuoteToInvoice,
  deleteDraft,
  duplicateDocument,
  issueDocument,
  respondToQuote,
  saveDraft,
  voidDocument,
} from "./service";
import { DOC_LABELS, type DocumentType } from "./types";

const id = z.uuid();

function refresh() {
  revalidatePath("/", "layout");
}

export async function saveDocumentAction(
  documentId: string | null,
  values: DocumentInputValues,
  issue: boolean,
): Promise<ActionResult<{ id: string; type: DocumentType; issued: boolean; error?: string }>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const actor = userActor(user);
    const savedId = await saveDraft(actor, documentId ? id.parse(documentId) : null, values);
    let issued = false;
    let error: string | undefined;
    if (issue) {
      // The draft is kept even if issuing fails, so nothing typed is lost.
      try {
        await issueDocument(actor, savedId);
        issued = true;
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        error = err.message;
      }
    }
    refresh();
    return { id: savedId, type: values.type, issued, error };
  });
}

export async function issueDocumentAction(documentId: string): Promise<ActionResult<{ number: string | null }>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const doc = await issueDocument(userActor(user), id.parse(documentId));
    refresh();
    return { number: doc.number };
  });
}

export async function voidDocumentAction(documentId: string, reason: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    await voidDocument(userActor(user), id.parse(documentId), reason);
    refresh();
    return null;
  }, "Document voided");
}

export async function deleteDraftAction(documentId: string): Promise<ActionResult<{ path: string }>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const type = await deleteDraft(userActor(user), id.parse(documentId));
    refresh();
    return { path: DOC_LABELS[type].path };
  }, "Draft deleted");
}

export async function duplicateDocumentAction(documentId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const newId = await duplicateDocument(userActor(user), id.parse(documentId));
    refresh();
    return { id: newId };
  }, "Copied to a new draft");
}

export async function convertQuoteAction(quoteId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const invoiceId = await convertQuoteToInvoice(userActor(user), id.parse(quoteId));
    refresh();
    return { id: invoiceId };
  }, "Draft invoice created from the quote");
}

export async function respondQuoteAction(quoteId: string, response: "accepted" | "declined"): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    await respondToQuote(userActor(user), id.parse(quoteId), z.enum(["accepted", "declined"]).parse(response));
    refresh();
    return null;
  }, response === "accepted" ? "Marked as accepted" : "Marked as declined");
}

export async function recordPaymentAction(values: PaymentInputValues): Promise<ActionResult<{ receipt: string | null }>> {
  return runAction(async () => {
    const user = await requirePermission("payments:write");
    const { payment } = await recordPayment(userActor(user), values);
    let receipt: string | null = null;
    if (values.sendReceipt && payment.kind === "payment") {
      const result = await sendPaymentReceipt(payment.id, user.id);
      receipt = result.status;
    }
    refresh();
    return { receipt };
  }, "Payment recorded");
}

export async function deletePaymentAction(paymentId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requirePermission("payments:write");
    await deletePayment(userActor(user), id.parse(paymentId));
    refresh();
    return null;
  }, "Payment deleted");
}

export async function fetchExchangeRateAction(currency: string, date: string): Promise<ActionResult<FxRate>> {
  return runAction(async () => {
    await requirePermission("documents:write");
    try {
      return await fetchInrRate(currencyField.parse(currency), dateString.parse(date));
    } catch (err) {
      throw new UserError(`Couldn't fetch a rate (${err instanceof Error ? err.message : "network error"}). Enter it manually.`);
    }
  });
}

const sendSchema = z.object({
  to: z.string(),
  cc: z.string(),
  subject: z.string().trim().min(1, "Add a subject").max(200),
  message: z.string().trim().min(1, "Add a message").max(5000),
  attachPdf: z.boolean(),
});

export async function sendDocumentAction(
  documentId: string,
  input: z.input<typeof sendSchema>,
): Promise<ActionResult<{ status: "sent" | "failed" | "skipped" }>> {
  return runAction(async () => {
    const user = await requirePermission("documents:write");
    const v = sendSchema.parse(input);
    const to = parseEmailList(v.to);
    const cc = parseEmailList(v.cc);
    const invalid = [...to, ...cc].filter((e) => !isValidEmail(e));
    if (invalid.length) throw new UserError(`Not a valid email: ${invalid.join(", ")}`, { to: "Check the addresses" });
    const result = await sendDocumentEmail({
      documentId: id.parse(documentId),
      to,
      cc,
      subject: v.subject,
      message: v.message,
      attachPdf: v.attachPdf,
      actor: userActor(user),
    });
    if (result.status === "failed") throw new UserError(`Sending failed: ${result.error}`);
    refresh();
    return { status: result.status };
  });
}
