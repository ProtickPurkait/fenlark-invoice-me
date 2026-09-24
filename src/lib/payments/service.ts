import "server-only";
import { eq } from "drizzle-orm";
import { logActivity, type Actor } from "@/lib/activity";
import { db } from "@/lib/db";
import { documents, payments, type DocumentRow, type Payment } from "@/lib/db/schema";
import { recalcInvoice } from "@/lib/documents/service";
import { UserError } from "@/lib/errors";
import { dec, formatMoney, money } from "@/lib/money";
import { paymentSchema, type PaymentInputValues } from "@/lib/validation/document";

export interface RecordedPayment {
  payment: Payment;
  invoice: DocumentRow;
}

export async function recordPayment(
  actor: Actor,
  raw: PaymentInputValues,
  extra: { gateway?: string; gatewayPaymentId?: string } = {},
): Promise<RecordedPayment> {
  const input = paymentSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(documents).where(eq(documents.id, input.documentId)).for("update");
    if (!invoice || invoice.type !== "invoice") throw new UserError("Invoice not found");
    if (invoice.status === "draft") throw new UserError("Issue the invoice before recording payments");
    if (invoice.status === "void") throw new UserError("This invoice is void");
    if (input.date < invoice.issueDate) {
      throw new UserError("Payment date is before the invoice date", { date: "Before the invoice date" });
    }

    const settled = dec(input.amount).plus(input.tdsAmount);
    const balance = dec(invoice.balanceDue);
    if (input.kind === "payment" && settled.greaterThan(balance)) {
      throw new UserError(
        `That's more than the balance due (${formatMoney(balance, invoice.currency)}). If the client overpaid, record the balance and refund the rest.`,
        { amount: "More than the balance due" },
      );
    }
    if (input.kind === "refund") {
      const refundable = balance.isNegative() ? balance.negated() : dec(0);
      if (dec(input.amount).greaterThan(refundable)) {
        throw new UserError(`Only ${formatMoney(refundable, invoice.currency)} is refundable on this invoice (the overpaid or credited amount).`, {
          amount: "More than the refundable amount",
        });
      }
    }

    const [payment] = await tx
      .insert(payments)
      .values({
        documentId: invoice.id,
        kind: input.kind,
        date: input.date,
        amount: money(input.amount),
        tdsAmount: money(input.tdsAmount),
        tdsSection: input.tdsSection,
        method: input.method,
        reference: input.reference,
        notes: input.notes,
        gateway: extra.gateway ?? null,
        gatewayPaymentId: extra.gatewayPaymentId ?? null,
        createdBy: actor.type === "user" ? actor.id : null,
      })
      .returning();
    const updated = await recalcInvoice(tx, invoice.id);

    const what =
      input.kind === "refund"
        ? `Refunded ${formatMoney(input.amount, invoice.currency)}`
        : `Received ${formatMoney(input.amount, invoice.currency)}${dec(input.tdsAmount).greaterThan(0) ? ` + TDS ${formatMoney(input.tdsAmount, invoice.currency)}` : ""}`;
    await logActivity(
      actor,
      { entityType: "document", entityId: invoice.id, action: input.kind, summary: `${what} on invoice ${invoice.number}`, data: { paymentId: payment.id } },
      tx,
    );
    return { payment, invoice: updated };
  });
}

export async function deletePayment(actor: Actor, paymentId: string): Promise<DocumentRow> {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!payment) throw new UserError("Payment not found");
    if (payment.gateway) throw new UserError("Online payments are recorded by the gateway and can't be deleted here. Refund it instead.");
    const [invoice] = await tx.select().from(documents).where(eq(documents.id, payment.documentId)).for("update");
    await tx.delete(payments).where(eq(payments.id, paymentId));
    const updated = await recalcInvoice(tx, payment.documentId);
    await logActivity(
      actor,
      {
        entityType: "document",
        entityId: payment.documentId,
        action: "delete_payment",
        summary: `Deleted a ${payment.kind} of ${formatMoney(payment.amount, invoice.currency)} on invoice ${invoice.number}`,
      },
      tx,
    );
    return updated;
  });
}
