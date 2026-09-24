"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deletePaymentAction } from "@/lib/documents/actions";
import { paymentMethodLabel } from "@/lib/documents/types";
import { formatDate } from "@/lib/dates";
import { dec, formatMoney } from "@/lib/money";

export interface PaymentRow {
  id: string;
  kind: "payment" | "refund";
  date: string;
  amount: string;
  tdsAmount: string;
  tdsSection: string;
  method: string;
  reference: string;
  gateway: string | null;
}

export function PaymentList({ payments, currency, canDelete }: { payments: PaymentRow[]; currency: string; canDelete: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (payments.length === 0) return <p className="text-sm text-zinc-500">No payments recorded yet.</p>;
  return (
    <ul className="divide-y divide-zinc-100">
      {payments.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-zinc-900">
              {p.kind === "refund" ? "Refund " : ""}
              {formatMoney(p.amount, currency)}
              {dec(p.tdsAmount).greaterThan(0) ? (
                <span className="font-normal text-zinc-500">
                  {" "}
                  + TDS {formatMoney(p.tdsAmount, currency)}
                  {p.tdsSection ? ` (${p.tdsSection})` : ""}
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {formatDate(p.date)} · {p.gateway ? `Online (${p.gateway})` : paymentMethodLabel(p.method)}
              {p.reference ? ` · ${p.reference}` : ""}
            </p>
          </div>
          {canDelete && !p.gateway ? (
            <button
              type="button"
              disabled={pending}
              className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete payment"
              onClick={() => {
                if (!confirm("Delete this payment? The invoice balance will be updated.")) return;
                startTransition(async () => {
                  const r = await deletePaymentAction(p.id);
                  if (r.ok) toast.success("Payment deleted");
                  else toast.error(r.error);
                  router.refresh();
                });
              }}
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
