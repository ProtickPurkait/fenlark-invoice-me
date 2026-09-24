import { handleWebhook, WebhookError } from "@/lib/gateways/service";
import { isGatewayId } from "@/lib/gateways/providers";

/** Payment-gateway webhooks: /api/webhooks/razorpay and /api/webhooks/stripe. */
export async function POST(request: Request, ctx: RouteContext<"/api/webhooks/[provider]">) {
  const { provider } = await ctx.params;
  if (!isGatewayId(provider)) return Response.json({ error: "Unknown provider" }, { status: 404 });
  const rawBody = await request.text();
  try {
    const outcome = await handleWebhook(provider, rawBody, request.headers);
    return Response.json({ ok: true, outcome });
  } catch (err) {
    if (err instanceof WebhookError) return Response.json({ error: err.message }, { status: err.status });
    console.error(`[webhook:${provider}]`, err);
    // 5xx makes the gateway retry later.
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
