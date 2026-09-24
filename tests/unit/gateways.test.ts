import { describe, expect, it } from "vitest";
import { hmacSha256Hex } from "@/lib/crypto";
import { razorpay, stripe, toMinorUnits } from "@/lib/gateways/providers";

const input = {
  documentId: "11111111-1111-4111-8111-111111111111",
  number: "FL/26-27/0001",
  amount: "11800.50",
  currency: "INR",
  description: "Tax Invoice FL/26-27/0001",
  customer: { name: "Acme", email: "ap@acme.test", phone: "" },
  successUrl: "https://bill.fenlark.in/p/tok?paid=1",
  cancelUrl: "https://bill.fenlark.in/p/tok",
};

function stubFetch(response: unknown, capture: { url?: string; init?: RequestInit }) {
  return (async (url: string, init?: RequestInit) => {
    capture.url = url;
    capture.init = init;
    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("razorpay", () => {
  const config = { keyId: "rzp_test_x", keySecret: "secret", webhookSecret: "whsec" };

  it("creates a payment link in paise with the invoice reference", async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    const link = await razorpay.createLink(config, input, stubFetch({ id: "plink_1", short_url: "https://rzp.io/i/abc" }, cap));
    expect(link).toEqual({ externalId: "plink_1", url: "https://rzp.io/i/abc" });
    expect(cap.url).toBe("https://api.razorpay.com/v1/payment_links");
    const body = JSON.parse(String(cap.init!.body));
    expect(body.amount).toBe(1180050);
    expect(body.reference_id).toMatch(/^FL-26-27-0001-/);
    expect(body.notes.document_id).toBe(input.documentId);
    expect((cap.init!.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("rzp_test_x:secret").toString("base64")}`);
  });

  it("verifies signatures and parses payment_link.paid", () => {
    const raw = JSON.stringify({
      event: "payment_link.paid",
      payload: {
        payment_link: { entity: { id: "plink_1", notes: { document_id: input.documentId } } },
        payment: { entity: { id: "pay_9", amount: 1180050, currency: "INR" } },
      },
    });
    const headers = new Headers({ "x-razorpay-signature": hmacSha256Hex("whsec", raw), "x-razorpay-event-id": "evt_1" });
    expect(razorpay.verifyWebhook(config, raw, headers)).toBe(true);
    expect(razorpay.verifyWebhook(config, raw + " ", headers)).toBe(false);
    expect(razorpay.parseWebhook(raw, headers)).toEqual({
      eventId: "evt_1",
      type: "payment_link.paid",
      paid: { externalId: "plink_1", paymentId: "pay_9", amount: "11800.50", currency: "INR", documentId: input.documentId },
    });
  });
});

describe("stripe", () => {
  const config = { secretKey: "sk_test_x", webhookSecret: "whsec_s" };

  it("creates a checkout session with form-encoded line items", async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    const link = await stripe.createLink(config, { ...input, currency: "USD", amount: "1200.5" }, stubFetch({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" }, cap));
    expect(link.externalId).toBe("cs_1");
    const form = new URLSearchParams(String(cap.init!.body));
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("120050");
    expect(form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(form.get("metadata[document_id]")).toBe(input.documentId);
    expect(form.get("customer_email")).toBe("ap@acme.test");
  });

  it("verifies timestamped signatures", () => {
    const raw = JSON.stringify({
      id: "evt_s1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", payment_status: "paid", amount_total: 120050, currency: "usd", payment_intent: "pi_1", metadata: { document_id: input.documentId } } },
    });
    const now = new Date("2026-09-24T10:00:00Z");
    const t = Math.floor(now.getTime() / 1000);
    const sig = hmacSha256Hex("whsec_s", `${t}.${raw}`);
    expect(stripe.verifyWebhook(config, raw, new Headers({ "stripe-signature": `t=${t},v1=${sig}` }), now)).toBe(true);
    expect(stripe.verifyWebhook(config, raw, new Headers({ "stripe-signature": `t=${t},v1=${sig}` }), new Date(now.getTime() + 600_000))).toBe(false);
    expect(stripe.verifyWebhook(config, raw, new Headers({ "stripe-signature": `t=${t},v1=deadbeef` }), now)).toBe(false);
    expect(stripe.parseWebhook(raw, new Headers())?.paid).toEqual({
      externalId: "cs_1",
      paymentId: "pi_1",
      amount: "1200.50",
      currency: "USD",
      documentId: input.documentId,
    });
  });
});

it("converts to minor units without float error", () => {
  expect(toMinorUnits("0.29")).toBe(29);
  expect(toMinorUnits("1005.10")).toBe(100510);
});
