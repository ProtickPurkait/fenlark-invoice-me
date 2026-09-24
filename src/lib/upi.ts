import { money, type Numeric } from "@/lib/money";

/** UPI virtual payment address, e.g. `fenlark@okicici`. */
const VPA_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

export function isValidUpiId(value: string | null | undefined): boolean {
  return VPA_RE.test((value ?? "").trim());
}

export interface UpiPaymentInput {
  upiId: string;
  payeeName: string;
  amount?: Numeric | null;
  /** Transaction note shown in the payer's app (max ~80 chars). */
  note?: string;
}

/**
 * `upi://pay` deep link per the NPCI UPI linking spec. Scanning the QR opens
 * any UPI app with payee, amount and note pre-filled. No `tr` (merchant
 * reference) parameter: several apps reject it for non-merchant VPAs.
 */
export function upiUri(input: UpiPaymentInput): string {
  const params: [string, string][] = [
    ["pa", input.upiId.trim()],
    ["pn", input.payeeName.trim().slice(0, 50)],
  ];
  if (input.amount !== undefined && input.amount !== null && Number(input.amount) > 0) {
    params.push(["am", money(input.amount)]);
  }
  params.push(["cu", "INR"]);
  if (input.note) params.push(["tn", input.note.slice(0, 80)]);
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}
