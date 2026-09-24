"use client";

import { Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveGatewayAction, saveGatewayRouting } from "@/app/(app)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";

export interface GatewayView {
  id: string;
  label: string;
  description: string;
  webhookUrl: string;
  webhookEvents: string;
  enabled: boolean;
  mode: "test" | "live";
  fields: { key: string; label: string; secret: boolean; hint?: string; placeholder?: string; value: string; isSet: boolean }[];
}

export function GatewaySettings({
  gateways,
  routing,
  canEdit,
  encryptionReady,
}: {
  gateways: GatewayView[];
  routing: { gatewayForInr: string; gatewayForForeign: string };
  canEdit: boolean;
  encryptionReady: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info" title="How online payments work">
        Clients see a “Pay online” button on the invoice link and in the portal. When the gateway confirms the payment
        (via its webhook), the payment is recorded on the invoice automatically and a receipt is emailed. Bank transfer
        and the UPI QR code always work without a gateway.
      </Alert>
      {!encryptionReady ? (
        <Alert tone="warning" title="ENCRYPTION_KEY is not set">
          Gateway secrets are stored encrypted. Add an ENCRYPTION_KEY environment variable (openssl rand -base64 32) and
          redeploy before saving credentials.
        </Alert>
      ) : null}
      {gateways.map((g) => (
        <GatewayCard key={g.id} gateway={g} canEdit={canEdit && encryptionReady} />
      ))}
      <RoutingCard routing={routing} canEdit={canEdit} enabled={gateways.filter((g) => g.enabled).map((g) => ({ id: g.id, label: g.label }))} />
    </div>
  );
}

function GatewayCard({ gateway, canEdit }: { gateway: GatewayView; canEdit: boolean }) {
  const [enabled, setEnabled] = useState(gateway.enabled);
  const [mode, setMode] = useState(gateway.mode);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(gateway.fields.map((f) => [f.key, f.secret ? "" : f.value])));
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {gateway.label}
            {gateway.enabled ? <Badge tone="success">Enabled · {gateway.mode}</Badge> : <Badge tone="muted">Off</Badge>}
          </span>
        }
        description={gateway.description}
      />
      <CardBody>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await saveGatewayAction(gateway.id, { enabled, mode, values });
              if (result.ok) {
                toast.success(result.message ?? "Saved");
                setValues((v) => Object.fromEntries(Object.entries(v).map(([k, val]) => [k, gateway.fields.find((f) => f.key === k)?.secret ? "" : val])));
              } else toast.error(result.error);
            });
          }}
        >
          <fieldset disabled={!canEdit} className="contents">
            {gateway.fields.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`${gateway.id}-${f.key}`} hint={f.secret && f.isSet ? "Saved — leave blank to keep it" : f.hint}>
                <Input
                  id={`${gateway.id}-${f.key}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  placeholder={f.secret && f.isSet ? "••••••••••••" : f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
            <Field label="Mode" htmlFor={`${gateway.id}-mode`} hint="Use test keys first; switch to live keys when ready">
              <Select id={`${gateway.id}-mode`} value={mode} onChange={(e) => setMode(e.target.value as "test" | "live")}>
                <option value="test">Test</option>
                <option value="live">Live</option>
              </Select>
            </Field>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm sm:col-span-2">
              <p className="font-medium text-zinc-800">Webhook</p>
              <p className="mt-1 text-zinc-600">
                In the {gateway.label} dashboard, add a webhook for <code className="rounded bg-white px-1">{gateway.webhookEvents}</code> pointing to:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs">{gateway.webhookUrl}</code>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Copy webhook URL"
                  onClick={() => navigator.clipboard.writeText(gateway.webhookUrl).then(() => toast.success("Copied"))}
                >
                  <Copy />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 sm:col-span-2">
              <Checkbox label={`Offer ${gateway.label} on invoices`} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              {canEdit ? (
                <Button type="submit" loading={pending}>
                  Save {gateway.label}
                </Button>
              ) : null}
            </div>
          </fieldset>
        </form>
      </CardBody>
    </Card>
  );
}

function RoutingCard({
  routing,
  canEdit,
  enabled,
}: {
  routing: { gatewayForInr: string; gatewayForForeign: string };
  canEdit: boolean;
  enabled: { id: string; label: string }[];
}) {
  const [values, setValues] = useState(routing);
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader title="Which gateway to use" description="When both are enabled. Automatic = Razorpay for INR, Stripe for other currencies." />
      <CardBody className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <Field label="INR invoices" htmlFor="route-inr">
          <Select id="route-inr" disabled={!canEdit} value={values.gatewayForInr} onChange={(e) => setValues((v) => ({ ...v, gatewayForInr: e.target.value }))}>
            <option value="">Automatic</option>
            {enabled.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Foreign-currency invoices" htmlFor="route-foreign">
          <Select id="route-foreign" disabled={!canEdit} value={values.gatewayForForeign} onChange={(e) => setValues((v) => ({ ...v, gatewayForForeign: e.target.value }))}>
            <option value="">Automatic</option>
            {enabled.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        {canEdit ? (
          <Button
            variant="outline"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveGatewayRouting(values);
                if (r.ok) toast.success("Saved");
                else toast.error(r.error);
              })
            }
          >
            Save
          </Button>
        ) : null}
      </CardBody>
    </Card>
  );
}
