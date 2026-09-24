import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hmacSha256Hex } from "@/lib/crypto";
import { db } from "@/lib/db";
import { documents, gatewayConfigs, gatewayLinks, payments } from "@/lib/db/schema";
import { issueDocument, saveDraft } from "@/lib/documents/service";
import { captureOutbox, releaseOutbox } from "@/lib/email/send";
import { gatewayFor, gatewayStates, handleWebhook, paymentLinkFor, saveGateway, WebhookError } from "@/lib/gateways/service";
import { draftInput, seedBusiness, seedClient, seedUser } from "../helpers/fixtures";
import { setupTestDb, teardownTestDb } from "../helpers/db";

function razorpayEvent(linkId: string, paymentId: string, paise: number, eventId: string) {
  const raw = JSON.stringify({
    event: "payment_link.paid",
    payload: { payment_link: { entity: { id: linkId, notes: {} } }, payment: { entity: { id: paymentId, amount: paise, currency: "INR" } } },
  });
  return { raw, headers: new Headers({ "x-razorpay-signature": hmacSha256Hex("whsec", raw), "x-razorpay-event-id": eventId }) };
}

describe("payment gateways", () => {
  let outbox: ReturnType<typeof captureOutbox>;
  beforeEach(async () => {
    await setupTestDb();
    await seedBusiness();
    outbox = captureOutbox();
  });
  afterAll(async () => {
    releaseOutbox();
    await teardownTestDb();
  });

  it("stores secrets encrypted and never exposes them", async () => {
    const actor = await seedUser();
    await saveGateway(actor, "razorpay", { enabled: true, mode: "test", values: { keyId: "rzp_test_1", keySecret: "s3cret", webhookSecret: "whsec" } });
    const [row] = await db.select().from(gatewayConfigs).where(eq(gatewayConfigs.provider, "razorpay"));
    expect(row.secretConfig).toMatch(/^v1\./);
    expect(row.secretConfig).not.toContain("s3cret");
    expect(row.publicConfig).toEqual({ keyId: "rzp_test_1" });
    const [state] = await gatewayStates();
    expect(state.secretsSet).toEqual({ keySecret: true, webhookSecret: true });
    // Blank secret fields keep existing values.
    await saveGateway(actor, "razorpay", { enabled: true, mode: "live", values: { keyId: "rzp_live_1", keySecret: "", webhookSecret: "" } });
    expect((await gatewayStates())[0].secretsSet.keySecret).toBe(true);
    await expect(saveGateway(actor, "stripe", { enabled: true, mode: "test", values: { secretKey: "", webhookSecret: "" } })).rejects.toThrow(/fill in/);
  });

  it("routes INR to Razorpay and foreign currency to Stripe", async () => {
    const actor = await seedUser();
    expect(await gatewayFor("INR")).toBeNull();
    await saveGateway(actor, "razorpay", { enabled: true, mode: "test", values: { keyId: "k", keySecret: "s", webhookSecret: "w" } });
    expect((await gatewayFor("INR"))?.id).toBe("razorpay");
    expect((await gatewayFor("USD"))?.id).toBe("razorpay");
    await saveGateway(actor, "stripe", { enabled: true, mode: "test", values: { secretKey: "sk", webhookSecret: "wh" } });
    expect((await gatewayFor("USD"))?.id).toBe("stripe");
  });

  it("creates a link once and records the webhook payment exactly once", async () => {
    const actor = await seedUser();
    await saveGateway(actor, "razorpay", { enabled: true, mode: "test", values: { keyId: "k", keySecret: "s", webhookSecret: "whsec" } });
    const client = await seedClient();
    const inv = await issueDocument(actor, await saveDraft(actor, null, draftInput(client.id)));

    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ id: "plink_A", short_url: "https://rzp.io/i/A" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await paymentLinkFor(inv.id, fetcher)).toBe("https://rzp.io/i/A");
    expect(await paymentLinkFor(inv.id, fetcher)).toBe("https://rzp.io/i/A");
    expect(calls).toBe(1);

    const bad = razorpayEvent("plink_A", "pay_1", 1180000, "evt_1");
    await expect(handleWebhook("razorpay", bad.raw, new Headers({ "x-razorpay-signature": "nope" }))).rejects.toBeInstanceOf(WebhookError);

    const ev = razorpayEvent("plink_A", "pay_1", 1180000, "evt_1");
    expect(await handleWebhook("razorpay", ev.raw, ev.headers)).toBe("recorded");
    expect(await handleWebhook("razorpay", ev.raw, ev.headers)).toBe("duplicate");
    // Same payment delivered under a different event id.
    const again = razorpayEvent("plink_A", "pay_1", 1180000, "evt_2");
    expect(await handleWebhook("razorpay", again.raw, again.headers)).toBe("duplicate");

    const [doc] = await db.select().from(documents).where(eq(documents.id, inv.id));
    expect(doc).toMatchObject({ status: "paid", balanceDue: "0.00", amountPaid: "11800.00" });
    const rows = await db.select().from(payments).where(eq(payments.documentId, inv.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: "gateway", gateway: "razorpay", gatewayPaymentId: "pay_1" });
    const [link] = await db.select().from(gatewayLinks);
    expect(link.status).toBe("paid");
    expect(outbox.some((m) => m.kind === "receipt")).toBe(true);

    await expect(paymentLinkFor(inv.id, fetcher)).rejects.toThrow(/nothing left to pay/);
    const late = razorpayEvent("plink_A", "pay_2", 1180000, "evt_3");
    expect(await handleWebhook("razorpay", late.raw, late.headers)).toBe("already_paid");
  });
});
