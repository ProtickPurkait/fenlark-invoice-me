import type { Metadata } from "next";
import { GatewaySettings } from "@/components/settings/gateways";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { appUrl, env } from "@/lib/env";
import { PROVIDERS } from "@/lib/gateways/providers";
import { gatewayStates } from "@/lib/gateways/service";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Payment gateways" };

export default async function GatewaysPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const states = await gatewayStates();
  return (
    <GatewaySettings
      canEdit={can(user.role, "gateways:manage")}
      encryptionReady={Boolean(env().ENCRYPTION_KEY)}
      routing={{ gatewayForInr: settings.gatewayForInr, gatewayForForeign: settings.gatewayForForeign }}
      gateways={states.map((s) => {
        const p = PROVIDERS[s.id];
        return {
          id: s.id,
          label: p.label,
          description: p.description,
          webhookUrl: appUrl(`/api/webhooks/${s.id}`),
          webhookEvents: p.webhookEvents,
          enabled: s.enabled,
          mode: s.mode,
          fields: p.fields.map((f) => ({ ...f, value: f.secret ? "" : (s.publicConfig[f.key] ?? ""), isSet: f.secret ? s.secretsSet[f.key] : false })),
        };
      })}
    />
  );
}
