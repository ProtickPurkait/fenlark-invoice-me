import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { documentLines, documents, numberSeries } from "@/lib/db/schema";
import {
  convertQuoteToInvoice,
  deleteDraft,
  duplicateDocument,
  issueDocument,
  respondToQuote,
  saveDraft,
  voidDocument,
} from "@/lib/documents/service";
import { deletePayment, recordPayment } from "@/lib/payments/service";
import { loadNumberSeries } from "@/lib/settings";
import { draftInput, gstin, seedBusiness, seedClient, seedUser } from "../helpers/fixtures";
import { setupTestDb, teardownTestDb } from "../helpers/db";

async function getDoc(id: string) {
  const [d] = await db.select().from(documents).where(eq(documents.id, id));
  return d;
}

describe("documents", () => {
  let actor: Awaited<ReturnType<typeof seedUser>>;

  beforeEach(async () => {
    await setupTestDb();
    await seedBusiness();
    actor = await seedUser();
  });
  afterAll(teardownTestDb);

  it("computes intra-state totals on save and numbers on issue", async () => {
    const client = await seedClient();
    const id = await saveDraft(actor, null, draftInput(client.id));
    const draft = await getDoc(id);
    expect(draft).toMatchObject({ status: "draft", number: null, supplyType: "intra", cgstTotal: "900.00", sgstTotal: "900.00", total: "11800.00", dueDate: "2026-10-09" });

    const issued = await issueDocument(actor, id);
    expect(issued.number).toBe("FL/26-27/0001");
    expect(issued.fy).toBe("26-27");
    expect(issued.balanceDue).toBe("11800.00");
    expect(issued.sellerSnapshot?.gstin).toBeTruthy();
    expect(issued.clientSnapshot?.name).toBe("Acme Retail Pvt Ltd");
    expect(issued.publicToken).toHaveLength(32);

    await expect(issueDocument(actor, id)).rejects.toThrow(/already been issued/);
    await expect(saveDraft(actor, id, draftInput(client.id))).rejects.toThrow(/Only drafts/);

    const second = await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id)));
    expect(second.number).toBe("FL/26-27/0002");
  });

  it("allocates unique, consecutive numbers under concurrency", async () => {
    const client = await seedClient();
    const ids = await Promise.all(Array.from({ length: 12 }, () => saveDraft(actor, null, draftInput(client.id))));
    const issued = await Promise.all(ids.map((id) => issueDocument(actor, id)));
    const numbers = issued.map((d) => d.number).sort();
    expect(new Set(numbers).size).toBe(12);
    expect(numbers[0]).toBe("FL/26-27/0001");
    expect(numbers[11]).toBe("FL/26-27/0012");
  });

  it("does not burn a number when issuing fails", async () => {
    const client = await seedClient();
    await loadNumberSeries();
    await db.update(numberSeries).set({ pattern: "{PREFIX}-{FYLONG}-INVOICE-{SEQ}" }).where(eq(numberSeries.docType, "invoice"));
    const id = await saveDraft(actor, null, draftInput(client.id));
    await expect(issueDocument(actor, id)).rejects.toThrow(/16/);
    await db.update(numberSeries).set({ pattern: "{PREFIX}/{FY}/{SEQ}" }).where(eq(numberSeries.docType, "invoice"));
    expect((await issueDocument(actor, id)).number).toBe("FL/26-27/0001");
  });

  it("restarts numbering in a new financial year", async () => {
    const client = await seedClient();
    await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id, { issueDate: "2027-03-31" })));
    const april = await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id, { issueDate: "2027-04-01" })));
    expect(april.number).toBe("FL/27-28/0001");
  });

  it("charges IGST inter-state and nothing on exports under LUT", async () => {
    const mh = await seedClient({ name: "Mumbai Co", stateCode: "27", gstin: gstin("27", "AABCM2222C") });
    const inter = await getDoc(await saveDraft(actor, null, draftInput(mh.id, { placeOfSupply: "27" })));
    expect(inter).toMatchObject({ supplyType: "inter", igstTotal: "1800.00", cgstTotal: "0.00", total: "11800.00" });

    const us = await seedClient({ name: "Globex Inc", country: "US", stateCode: "", gstin: "", currency: "USD" });
    const exp = await issueDocument(
      actor,
      await saveDraft(actor, null, draftInput(us.id, { placeOfSupply: "96", currency: "USD", exchangeRate: "83.25", lines: [{ ...draftInput(us.id).lines[0], rate: "1200.50" }] })),
    );
    expect(exp).toMatchObject({ supplyType: "export", exportTax: "lut", taxTotal: "0.00", total: "1200.50", roundOff: "0.00", currency: "USD" });
    const [line] = await db.select().from(documentLines).where(eq(documentLines.documentId, exp.id));
    expect(line.gstRate).toBe("18.00");
  });

  it("requires an LUT for zero-rated exports", async () => {
    await seedBusiness({ lutArn: "" });
    const us = await seedClient({ name: "Globex Inc", country: "US", stateCode: "", gstin: "" });
    const id = await saveDraft(actor, null, draftInput(us.id, { placeOfSupply: "96", currency: "USD", exchangeRate: "83" }));
    await expect(issueDocument(actor, id)).rejects.toThrow(/LUT/);
    const withIgst = await saveDraft(actor, null, draftInput(us.id, { placeOfSupply: "96", currency: "USD", exchangeRate: "83", exportTax: "igst" }));
    expect((await issueDocument(actor, withIgst)).igstTotal).toBe("1800.00");
  });

  it("blocks issuing until the business profile is complete", async () => {
    await seedBusiness({ gstin: "" });
    const client = await seedClient();
    const id = await saveDraft(actor, null, draftInput(client.id));
    await expect(issueDocument(actor, id)).rejects.toThrow(/GSTIN/);
  });

  it("issues Bills of Supply without tax for composition dealers", async () => {
    await seedBusiness({ gstRegistration: "composition" });
    const client = await seedClient();
    const doc = await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id)));
    expect(doc.taxTotal).toBe("0.00");
    expect(doc.total).toBe("10000.00");
  });

  it("tracks payments with TDS through to paid", async () => {
    const client = await seedClient();
    const inv = await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id)));
    const base = { documentId: inv.id, kind: "payment" as const, date: "2026-10-01", tdsSection: "194J", method: "bank_transfer" as const, reference: "UTR1", notes: "" };

    const first = await recordPayment(actor, { ...base, amount: "5000", tdsAmount: "0" });
    expect(first.invoice).toMatchObject({ status: "partially_paid", balanceDue: "6800.00" });

    await expect(recordPayment(actor, { ...base, amount: "6800", tdsAmount: "1000" })).rejects.toThrow(/more than the balance/);

    const second = await recordPayment(actor, { ...base, amount: "5800", tdsAmount: "1000" });
    expect(second.invoice).toMatchObject({ status: "paid", balanceDue: "0.00", amountPaid: "10800.00", tdsAmount: "1000.00" });

    const back = await deletePayment(actor, second.payment.id);
    expect(back).toMatchObject({ status: "partially_paid", balanceDue: "6800.00" });

    await expect(voidDocument(actor, inv.id, "mistake")).rejects.toThrow(/payments/);
    await expect(recordPayment(actor, { ...base, date: "2026-09-01", amount: "10", tdsAmount: "0" })).rejects.toThrow(/before the invoice/);
  });

  it("applies credit and debit notes to the invoice balance", async () => {
    const client = await seedClient();
    const inv = await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id)));
    const noteLines = [{ ...draftInput(client.id).lines[0], rate: "2000" }];

    const cn = await issueDocument(
      actor,
      await saveDraft(actor, null, draftInput(client.id, { type: "credit_note", relatedDocumentId: inv.id, noteReason: "post_sale_discount", lines: noteLines })),
    );
    expect(cn.number).toBe("FLCN/26-27/0001");
    expect(cn.total).toBe("2360.00");
    expect(await getDoc(inv.id)).toMatchObject({ creditedTotal: "2360.00", balanceDue: "9440.00", status: "issued" });

    const dn = await issueDocument(
      actor,
      await saveDraft(actor, null, draftInput(client.id, { type: "debit_note", relatedDocumentId: inv.id, noteReason: "correction_in_invoice", lines: [{ ...noteLines[0], rate: "500" }] })),
    );
    expect(dn.number).toBe("FLDN/26-27/0001");
    expect((await getDoc(inv.id)).balanceDue).toBe("10030.00");

    const tooBig = await saveDraft(actor, null, draftInput(client.id, { type: "credit_note", relatedDocumentId: inv.id, noteReason: "others", lines: [{ ...noteLines[0], rate: "9000" }] }));
    await expect(issueDocument(actor, tooBig)).rejects.toThrow(/more than the invoice/);

    await voidDocument(actor, cn.id, "Issued in error");
    expect(await getDoc(inv.id)).toMatchObject({ creditedTotal: "0.00", balanceDue: "12390.00" });

    await expect(voidDocument(actor, inv.id, "x")).rejects.toThrow(/notes/);
  });

  it("inherits tax treatment from the invoice for notes", async () => {
    const mh = await seedClient({ name: "Mumbai Co", stateCode: "27", gstin: gstin("27", "AABCM2222C") });
    const inv = await issueDocument(actor, await saveDraft(actor, null, draftInput(mh.id, { placeOfSupply: "27" })));
    // The editor's place of supply is ignored for notes.
    const cnId = await saveDraft(actor, null, draftInput(mh.id, { type: "credit_note", relatedDocumentId: inv.id, noteReason: "others", placeOfSupply: "29" }));
    expect(await getDoc(cnId)).toMatchObject({ supplyType: "inter", placeOfSupply: "27", igstTotal: "1800.00" });
  });

  it("refunds overpayments created by credit notes", async () => {
    const client = await seedClient();
    const inv = await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id)));
    const base = { documentId: inv.id, date: "2026-10-01", tdsAmount: "0", tdsSection: "", method: "upi" as const, reference: "", notes: "" };
    await recordPayment(actor, { ...base, kind: "payment", amount: "11800" });
    await issueDocument(
      actor,
      await saveDraft(actor, null, draftInput(client.id, { type: "credit_note", relatedDocumentId: inv.id, noteReason: "deficiency_in_services", lines: [{ ...draftInput(client.id).lines[0], rate: "1000" }] })),
    );
    expect((await getDoc(inv.id)).balanceDue).toBe("-1180.00");
    await expect(recordPayment(actor, { ...base, kind: "refund", amount: "2000" })).rejects.toThrow(/refundable/);
    const refunded = await recordPayment(actor, { ...base, kind: "refund", amount: "1180" });
    expect(refunded.invoice).toMatchObject({ balanceDue: "0.00", status: "paid", amountPaid: "10620.00" });
  });

  it("converts quotes to invoices and restores them if the draft is deleted", async () => {
    const client = await seedClient();
    const quote = await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id, { type: "quote" })));
    expect(quote.number).toBe("FLQ/26-27/0001");
    expect(quote.validUntil).toBe("2026-10-24");
    await respondToQuote(actor, quote.id, "accepted");
    const invId = await convertQuoteToInvoice(actor, quote.id);
    expect((await getDoc(quote.id)).status).toBe("converted");
    const inv = await getDoc(invId);
    expect(inv).toMatchObject({ type: "invoice", status: "draft", relatedDocumentId: quote.id, total: "11800.00" });
    await expect(convertQuoteToInvoice(actor, quote.id)).rejects.toThrow(/already converted/);
    await deleteDraft(actor, invId);
    expect((await getDoc(quote.id)).status).toBe("accepted");
  });

  it("duplicates invoices as fresh drafts", async () => {
    const client = await seedClient();
    const inv = await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id)));
    const copy = await getDoc(await duplicateDocument(actor, inv.id));
    expect(copy).toMatchObject({ status: "draft", number: null, total: "11800.00", clientId: client.id });
  });

  it("rounds INR totals and keeps reverse-charge tax out of the total", async () => {
    const client = await seedClient();
    const lines = [{ ...draftInput(client.id).lines[0], rate: "999.99" }];
    const rounded = await getDoc(await saveDraft(actor, null, draftInput(client.id, { lines })));
    expect(rounded).toMatchObject({ total: "1180.00", roundOff: "0.01" });
    const rcm = await getDoc(await saveDraft(actor, null, draftInput(client.id, { reverseCharge: true })));
    expect(rcm).toMatchObject({ taxTotal: "1800.00", total: "10000.00", reverseCharge: true });
  });
});

describe("pdf", () => {
  beforeEach(async () => {
    await setupTestDb();
    await seedBusiness();
  });

  it("renders issued invoices and drafts", async () => {
    const actor = await seedUser();
    const client = await seedClient();
    const { renderDocumentPdf } = await import("@/lib/pdf/render");
    const draftId = await saveDraft(actor, null, draftInput(client.id));
    const draft = await renderDocumentPdf(draftId);
    expect(draft.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(draft.filename).toBe("Tax-Invoice-draft.pdf");
    await issueDocument(actor, draftId);
    const issued = await renderDocumentPdf(draftId);
    expect(issued.filename).toBe("Tax-Invoice-FL-26-27-0001.pdf");
    expect(issued.buffer.length).toBeGreaterThan(10_000);
  });
});
