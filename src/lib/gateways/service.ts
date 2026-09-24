import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { logActivity, type Actor } from "@/lib/activity";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { clients, documents, gatewayConfigs, gatewayLinks, payments, webhookEvents, type BusinessSettings } from "@/lib/db/schema";
import { documentTitle } from "@/lib/documents/types";
import { sendPaymentReceipt } from "@/lib/email/documents";
import { appUrl, env } from "@/lib/env";
import { UserError } from "@/lib/errors";
import { dec, money } from "@/lib/money";
import { recordPayment } from "@/lib/payments/service";
import { loadSettings } from "@/lib/settings";
import { todayIST } from "@/lib/dates";
import { PROVIDERS, type GatewayId, type GatewayProvider } from "./providers";

export interface GatewayState {
  id: GatewayId;
  enabled: boolean;
  mode: "test" | "live";
  publicConfig: Record<string, string>;
  /** Which secret fields have a stored value (values are never sent to the browser). */
  secretsSet: Record<string, boolean>;
}

function encryptionKey(): string {
  const key = env().ENCRYPTION_KEY;
  if (!key) throw new UserError("Set ENCRYPTION_KEY (openssl rand -base64 32) before saving gateway credentials.");
  return key;
}

async function loadRow(id: GatewayId) {
  const [row] = await db.select().from(gatewayConfigs).where(eq(gatewayConfigs.provider, id));
  return row ?? null;
}

function readSecrets(stored: string | null): Record<string, string> {
  if (!stored) return {};
  return JSON.parse(decryptSecret(stored, encryptionKey())) as Record<string, string>;
}

export async function gatewayStates(): Promise<GatewayState[]> {
  const rows = await db.select().from(gatewayConfigs);
  return (Object.keys(PROVIDERS) as GatewayId[]).map((id) => {
    const row = rows.find((r) => r.provider === id);
    let secrets: Record<string, string> = {};
    try {
      secrets = row?.secretConfig ? readSecrets(row.secretConfig) : {};
    } catch {
      secrets = {};
    }
    return {
      id,
      enabled: row?.enabled ?? false,
      mode: row?.mode ?? "test",
      publicConfig: row?.publicConfig ?? {},
      secretsSet: Object.fromEntries(PROVIDERS[id].fields.filter((f) => f.secret).map((f) => [f.key, Boolean(secrets[f.key])])),
    };
  });
}

/** Full config (public + decrypted secrets) for server-side use only. */
export async function gatewayConfig(id: GatewayId): Promise<{ enabled: boolean; config: Record<string, string> } | null> {
  const row = await loadRow(id);
  if (!row) return null;
  return { enabled: row.enabled, config: { ...row.publicConfig, ...readSecrets(row.secretConfig) } };
}

export async function saveGateway(
  actor: Actor,
  id: GatewayId,
  input: { enabled: boolean; mode: "test" | "live"; values: Record<string, string> },
): Promise<void> {
  const provider = PROVIDERS[id];
  const row = await loadRow(id);
  const publicConfig: Record<string, string> = {};
  const secrets = row?.secretConfig ? readSecrets(row.secretConfig) : {};
  for (const field of provider.fields) {
    const value = (input.values[field.key] ?? "").trim();
    if (field.secret) {
      // Blank secret fields keep the stored value.
      if (value) secrets[field.key] = value;
    } else {
      publicConfig[field.key] = value;
    }
  }
  if (input.enabled) {
    const missing = provider.fields.filter((f) => !(f.secret ? secrets[f.key] : publicConfig[f.key])).map((f) => f.label);
    if (missing.length) throw new UserError(`To enable ${provider.label}, fill in: ${missing.join(", ")}`);
  }
  const secretConfig = Object.keys(secrets).length ? encryptSecret(JSON.stringify(secrets), encryptionKey()) : null;
  const values = {
    enabled: input.enabled,
    mode: input.mode,
    publicConfig,
    secretConfig,
    updatedBy: actor.type === "user" ? actor.id : null,
  };
  await db
    .insert(gatewayConfigs)
    .values({ provider: id, ...values })
    .onConflictDoUpdate({ target: gatewayConfigs.provider, set: values });
  await logActivity(actor, {
    entityType: "gateway",
    entityId: id,
    action: "update",
    summary: `${input.enabled ? "Enabled" : "Updated (disabled)"} ${provider.label} in ${input.mode} mode`,
  });
}

/** Which enabled gateway handles a currency, honouring the preference in settings. */
export async function gatewayFor(currency: string, settings?: BusinessSettings): Promise<GatewayProvider | null> {
  const s = settings ?? (await loadSettings());
  const rows = await db.select({ provider: gatewayConfigs.provider, enabled: gatewayConfigs.enabled }).from(gatewayConfigs);
  const enabled = new Set(rows.filter((r) => r.enabled).map((r) => r.provider));
  const preferred = currency === "INR" ? s.gatewayForInr || "razorpay" : s.gatewayForForeign || "stripe";
  const order = [preferred, currency === "INR" ? "razorpay" : "stripe", "razorpay", "stripe"];
  const id = order.find((p) => enabled.has(p)) as GatewayId | undefined;
  return id ? PROVIDERS[id] : null;
}

/** Payment link for an invoice's current balance; reuses an unexpired one for the same amount. */
export async function paymentLinkFor(documentId: string, fetcher: typeof fetch = fetch): Promise<string> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc || doc.type !== "invoice") throw new UserError("Invoice not found");
  if (doc.status !== "issued" && doc.status !== "partially_paid") throw new UserError("This invoice has nothing left to pay");
  const amount = money(doc.balanceDue);
  if (dec(amount).lessThanOrEqualTo(0)) throw new UserError("This invoice has nothing left to pay");

  const settings = await loadSettings();
  const provider = await gatewayFor(doc.currency, settings);
  if (!provider) throw new UserError("Online payment isn't available for this invoice");

  const [existing] = await db
    .select()
    .from(gatewayLinks)
    .where(and(eq(gatewayLinks.documentId, doc.id), eq(gatewayLinks.provider, provider.id), eq(gatewayLinks.status, "created")))
    .orderBy(desc(gatewayLinks.createdAt))
    .limit(1);
  // Stripe Checkout sessions expire after 24h; Razorpay links don't expire by default.
  const maxAgeMs = provider.id === "stripe" ? 23 * 3_600_000 : 30 * 86_400_000;
  if (existing && existing.amount === amount && existing.currency === doc.currency && Date.now() - existing.createdAt.getTime() < maxAgeMs) {
    return existing.url;
  }

  const cfg = await gatewayConfig(provider.id);
  if (!cfg?.enabled) throw new UserError("Online payment isn't available for this invoice");
  const [client] = await db.select().from(clients).where(eq(clients.id, doc.clientId));
  const title = documentTitle("invoice", doc.sellerSnapshot?.gstRegistration ?? settings.gstRegistration);
  const back = appUrl(`/p/${doc.publicToken}`);
  const link = await provider.createLink(
    cfg.config,
    {
      documentId: doc.id,
      number: doc.number ?? doc.id,
      amount,
      currency: doc.currency,
      description: `${title} ${doc.number} — ${settings.tradeName || settings.legalName}`,
      customer: { name: doc.clientSnapshot?.name ?? client?.name ?? "", email: client?.email ?? "", phone: client?.phone ?? "" },
      successUrl: `${back}?paid=1`,
      cancelUrl: back,
    },
    fetcher,
  );
  await db.insert(gatewayLinks).values({
    documentId: doc.id,
    provider: provider.id,
    externalId: link.externalId,
    url: link.url,
    amount,
    currency: doc.currency,
  });
  return link.url;
}

export type WebhookOutcome = "ignored" | "duplicate" | "recorded" | "unmatched" | "already_paid";

/** Verify, de-duplicate and apply a gateway webhook. Throws on a bad signature. */
export async function handleWebhook(id: GatewayId, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const provider = PROVIDERS[id];
  const cfg = await gatewayConfig(id);
  if (!cfg) throw new WebhookError(404, `${provider.label} is not configured`);
  if (!provider.verifyWebhook(cfg.config, rawBody, headers)) throw new WebhookError(400, "Invalid signature");

  const event = provider.parseWebhook(rawBody, headers);
  if (!event) return "ignored";
  const inserted = await db
    .insert(webhookEvents)
    .values({ provider: id, eventId: event.eventId, type: event.type, payload: JSON.parse(rawBody) })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) return "duplicate";
  const eventRowId = inserted[0].id;

  try {
    if (!event.paid) {
      await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, eventRowId));
      return "ignored";
    }
    const paid = event.paid;
    const [link] = await db
      .select()
      .from(gatewayLinks)
      .where(and(eq(gatewayLinks.provider, id), eq(gatewayLinks.externalId, paid.externalId)));
    const documentId = link?.documentId ?? paid.documentId;
    if (!documentId) {
      await db.update(webhookEvents).set({ processedAt: new Date(), error: "No matching invoice" }).where(eq(webhookEvents.id, eventRowId));
      return "unmatched";
    }
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!doc) {
      await db.update(webhookEvents).set({ processedAt: new Date(), error: "Invoice not found" }).where(eq(webhookEvents.id, eventRowId));
      return "unmatched";
    }
    if (paid.currency && paid.currency !== doc.currency) {
      throw new Error(`Currency mismatch: paid ${paid.currency}, invoice ${doc.currency}`);
    }

    const [known] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.gateway, id), eq(payments.gatewayPaymentId, paid.paymentId)));
    if (known) {
      await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, eventRowId));
      return "duplicate";
    }

    const actor: Actor = { type: "gateway", id, label: provider.label };
    // Never reject money that arrived: cap at the balance; anything extra is noted for a refund.
    const balance = dec(doc.balanceDue);
    const amount = dec(paid.amount);
    const applied = amount.greaterThan(balance) ? balance : amount;
    if (applied.lessThanOrEqualTo(0)) {
      await logActivity(actor, {
        entityType: "document",
        entityId: doc.id,
        action: "overpaid",
        summary: `${provider.label} payment ${paid.paymentId} of ${money(amount)} ${paid.currency} arrived after invoice ${doc.number} was settled — refund it from the ${provider.label} dashboard`,
      });
      if (link) await db.update(gatewayLinks).set({ status: "paid", paidAt: new Date() }).where(eq(gatewayLinks.id, link.id));
      await db.update(webhookEvents).set({ processedAt: new Date(), error: "Invoice already settled" }).where(eq(webhookEvents.id, eventRowId));
      return "already_paid";
    }
    const { payment } = await recordPayment(
      actor,
      {
        documentId: doc.id,
        kind: "payment",
        date: todayIST(),
        amount: money(applied),
        tdsAmount: "0",
        tdsSection: "",
        method: "gateway",
        reference: paid.paymentId,
        notes: amount.greaterThan(balance) ? `Gateway received ${money(amount)}; ${money(amount.minus(balance))} more than the balance — refund it from the ${provider.label} dashboard.` : "",
      },
      { gateway: id, gatewayPaymentId: paid.paymentId },
    ).catch(async (err: unknown) => {
      // Unique (gateway, payment id): the same payment arrived through another event.
      if (err instanceof Error && /payments_gateway_payment_key/.test(err.message + String((err as { cause?: unknown }).cause ?? ""))) {
        return { payment: null };
      }
      throw err;
    });
    if (link) await db.update(gatewayLinks).set({ status: "paid", paidAt: new Date() }).where(eq(gatewayLinks.id, link.id));
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, eventRowId));
    if (!payment) return "duplicate";

    const settings = await loadSettings();
    if (settings.sendPaymentReceipts) await sendPaymentReceipt(payment.id, null).catch(() => undefined);
    return "recorded";
  } catch (err) {
    // Forget the event so the gateway's automatic retry gets processed again.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, eventRowId));
    throw err;
  }
}

export class WebhookError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
