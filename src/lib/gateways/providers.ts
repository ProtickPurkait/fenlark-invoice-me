import { hmacSha256Hex, safeEqual } from "@/lib/crypto";
import { dec } from "@/lib/money";

/**
 * Payment-gateway adapters. Plain `fetch` against each REST API (no SDKs), so
 * they're easy to test with a stubbed fetcher.
 */

export type GatewayId = "razorpay" | "stripe";

export interface GatewayField {
  key: string;
  label: string;
  secret: boolean;
  hint?: string;
  placeholder?: string;
}

export interface CreateLinkInput {
  documentId: string;
  number: string;
  amount: string;
  currency: string;
  description: string;
  customer: { name: string; email: string; phone: string };
  successUrl: string;
  cancelUrl: string;
}

export interface CreatedLink {
  externalId: string;
  url: string;
}

export interface PaidEvent {
  externalId: string;
  paymentId: string;
  amount: string;
  currency: string;
  documentId: string | null;
}

export interface ParsedEvent {
  eventId: string;
  type: string;
  paid: PaidEvent | null;
}

export interface GatewayProvider {
  id: GatewayId;
  label: string;
  description: string;
  fields: GatewayField[];
  webhookEvents: string;
  createLink(config: Record<string, string>, input: CreateLinkInput, fetcher?: typeof fetch): Promise<CreatedLink>;
  verifyWebhook(config: Record<string, string>, rawBody: string, headers: Headers, now?: Date): boolean;
  parseWebhook(rawBody: string, headers: Headers): ParsedEvent | null;
}

export function toMinorUnits(amount: string): number {
  return Number(dec(amount).times(100).toFixed(0));
}

function fromMinorUnits(amount: number): string {
  return dec(amount).dividedBy(100).toFixed(2);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { description?: string; message?: string } };
    return body.error?.description ?? body.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export const razorpay: GatewayProvider = {
  id: "razorpay",
  label: "Razorpay",
  description: "UPI, cards, netbanking and wallets for INR invoices. Uses Payment Links.",
  fields: [
    { key: "keyId", label: "Key ID", secret: false, placeholder: "rzp_live_…" },
    { key: "keySecret", label: "Key secret", secret: true },
    { key: "webhookSecret", label: "Webhook secret", secret: true, hint: "The secret you set when adding the webhook in the Razorpay dashboard." },
  ],
  webhookEvents: "payment_link.paid",

  async createLink(config, input, fetcher = fetch) {
    const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
    const response = await fetcher("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: toMinorUnits(input.amount),
        currency: input.currency,
        accept_partial: false,
        description: input.description.slice(0, 2048),
        // Must be unique per link; a suffix allows a fresh link after an amount change.
        reference_id: `${input.number.replace(/[^A-Za-z0-9-]/g, "-")}-${Date.now().toString(36)}`.slice(0, 40),
        customer: {
          name: input.customer.name,
          ...(input.customer.email ? { email: input.customer.email } : {}),
          ...(input.customer.phone ? { contact: input.customer.phone } : {}),
        },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { document_id: input.documentId, invoice_number: input.number },
        callback_url: input.successUrl,
        callback_method: "get",
      }),
    });
    if (!response.ok) throw new Error(`Razorpay: ${await readError(response)}`);
    const body = (await response.json()) as { id: string; short_url: string };
    return { externalId: body.id, url: body.short_url };
  },

  verifyWebhook(config, rawBody, headers) {
    const signature = headers.get("x-razorpay-signature");
    if (!signature || !config.webhookSecret) return false;
    return safeEqual(hmacSha256Hex(config.webhookSecret, rawBody), signature);
  },

  parseWebhook(rawBody, headers) {
    const body = JSON.parse(rawBody) as {
      event?: string;
      payload?: {
        payment_link?: { entity?: { id: string; notes?: Record<string, string> } };
        payment?: { entity?: { id: string; amount: number; currency: string } };
      };
    };
    if (!body.event) return null;
    const eventId = headers.get("x-razorpay-event-id") ?? `${body.event}:${body.payload?.payment?.entity?.id ?? ""}`;
    let paid: PaidEvent | null = null;
    const link = body.payload?.payment_link?.entity;
    const payment = body.payload?.payment?.entity;
    if (body.event === "payment_link.paid" && link && payment) {
      paid = {
        externalId: link.id,
        paymentId: payment.id,
        amount: fromMinorUnits(payment.amount),
        currency: payment.currency,
        documentId: link.notes?.document_id ?? null,
      };
    }
    return { eventId, type: body.event, paid };
  },
};

const STRIPE_TOLERANCE_SECONDS = 300;

export const stripe: GatewayProvider = {
  id: "stripe",
  label: "Stripe",
  description: "Cards and wallets, best for international clients paying in USD, EUR, GBP and more. Uses Checkout.",
  fields: [
    { key: "secretKey", label: "Secret key", secret: true, placeholder: "sk_live_…" },
    { key: "webhookSecret", label: "Webhook signing secret", secret: true, placeholder: "whsec_…" },
  ],
  webhookEvents: "checkout.session.completed",

  async createLink(config, input, fetcher = fetch) {
    const form = new URLSearchParams({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.documentId,
      "metadata[document_id]": input.documentId,
      "metadata[invoice_number]": input.number,
      "payment_intent_data[metadata][document_id]": input.documentId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(toMinorUnits(input.amount)),
      "line_items[0][price_data][product_data][name]": input.description.slice(0, 250),
    });
    if (input.customer.email) form.set("customer_email", input.customer.email);
    const response = await fetcher("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!response.ok) throw new Error(`Stripe: ${await readError(response)}`);
    const body = (await response.json()) as { id: string; url: string };
    return { externalId: body.id, url: body.url };
  },

  verifyWebhook(config, rawBody, headers, now = new Date()) {
    const header = headers.get("stripe-signature");
    if (!header || !config.webhookSecret) return false;
    const parts = header.split(",").map((p) => p.split("=") as [string, string]);
    const timestamp = parts.find(([k]) => k === "t")?.[1];
    const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
    if (!timestamp || signatures.length === 0) return false;
    if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > STRIPE_TOLERANCE_SECONDS) return false;
    const expected = hmacSha256Hex(config.webhookSecret, `${timestamp}.${rawBody}`);
    return signatures.some((s) => safeEqual(expected, s));
  },

  parseWebhook(rawBody) {
    const body = JSON.parse(rawBody) as {
      id?: string;
      type?: string;
      data?: {
        object?: {
          id: string;
          payment_status?: string;
          amount_total?: number;
          currency?: string;
          payment_intent?: string | null;
          metadata?: Record<string, string>;
        };
      };
    };
    if (!body.id || !body.type) return null;
    const session = body.data?.object;
    let paid: PaidEvent | null = null;
    if (
      (body.type === "checkout.session.completed" || body.type === "checkout.session.async_payment_succeeded") &&
      session &&
      session.payment_status === "paid"
    ) {
      paid = {
        externalId: session.id,
        paymentId: session.payment_intent ?? session.id,
        amount: fromMinorUnits(session.amount_total ?? 0),
        currency: (session.currency ?? "").toUpperCase(),
        documentId: session.metadata?.document_id ?? null,
      };
    }
    return { eventId: body.id, type: body.type, paid };
  },
};

export const PROVIDERS: Record<GatewayId, GatewayProvider> = { razorpay, stripe };

export function isGatewayId(value: string): value is GatewayId {
  return value in PROVIDERS;
}
