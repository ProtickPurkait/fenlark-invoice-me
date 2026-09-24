import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { FilterTabs, Pagination, SearchInput } from "@/components/app/list-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { formatDate, todayIST } from "@/lib/dates";
import { countByFilter, listDocuments, PAGE_SIZE, type ListFilter } from "@/lib/documents/queries";
import { DOC_LABELS, displayStatus, documentPath, type DocumentType } from "@/lib/documents/types";
import { dec, formatMoney } from "@/lib/money";

const FILTERS: Record<DocumentType, { value: string; label: string }[]> = {
  invoice: [
    { value: "", label: "All" },
    { value: "draft", label: "Drafts" },
    { value: "unpaid", label: "Unpaid" },
    { value: "overdue", label: "Overdue" },
    { value: "paid", label: "Paid" },
    { value: "void", label: "Void" },
  ],
  quote: [
    { value: "", label: "All" },
    { value: "draft", label: "Drafts" },
    { value: "open", label: "Open" },
    { value: "accepted", label: "Accepted" },
    { value: "closed", label: "Declined / expired" },
  ],
  credit_note: [
    { value: "", label: "All" },
    { value: "draft", label: "Drafts" },
    { value: "void", label: "Void" },
  ],
  debit_note: [
    { value: "", label: "All" },
    { value: "draft", label: "Drafts" },
    { value: "void", label: "Void" },
  ],
};

const DESCRIPTIONS: Record<DocumentType, string> = {
  invoice: "Tax invoices you've raised and what's still owed.",
  quote: "Estimates you've sent. Accepted quotes convert to invoices in one click.",
  credit_note: "Reduce what a client owes on an invoice — returns, discounts, corrections.",
  debit_note: "Increase the amount due on an invoice — undercharges, extra charges.",
};

export async function DocumentListPage({ type, searchParams }: { type: DocumentType; searchParams: Record<string, string | string[] | undefined> }) {
  const user = await requireUser();
  const today = todayIST();
  const filter = (typeof searchParams.status === "string" ? searchParams.status : "") as ListFilter | "";
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  const page = Number(searchParams.page) || 1;
  const [{ rows, total }, counts] = await Promise.all([
    listDocuments({ type, filter: filter || "all", q, page, today }),
    type === "invoice" ? countByFilter(type, today) : Promise.resolve(null),
  ]);
  const label = DOC_LABELS[type];
  const canWrite = can(user.role, "documents:write");
  const isNote = type === "credit_note" || type === "debit_note";

  return (
    <>
      <PageHeader
        title={label.plural}
        description={DESCRIPTIONS[type]}
        actions={
          canWrite ? (
            <Button asChild>
              <Link href={`${label.path}/new`}>
                <Plus /> New {label.singular.toLowerCase()}
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder="Search number, client, reference…" className="sm:w-80" />
        <FilterTabs
          param="status"
          current={filter}
          options={FILTERS[type].map((f) => ({
            ...f,
            count: counts && f.value in counts ? counts[f.value] : f.value === "" && counts ? counts.all : undefined,
          }))}
        />
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={q || filter ? `No ${label.plural.toLowerCase()} match` : `No ${label.plural.toLowerCase()} yet`}
            description={
              isNote && !q && !filter
                ? "Create one from an issued invoice's page, or here."
                : undefined
            }
            action={
              canWrite && !q && !filter ? (
                <Button asChild>
                  <Link href={`${label.path}/new`}>
                    <Plus /> New {label.singular.toLowerCase()}
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Number</TH>
                  <TH>Client</TH>
                  <TH>Date</TH>
                  {type === "invoice" ? <TH>Due</TH> : null}
                  {type === "quote" ? <TH>Valid until</TH> : null}
                  <TH>Status</TH>
                  <TH align="right">Amount</TH>
                  {type === "invoice" ? <TH align="right">Balance</TH> : null}
                </tr>
              </THead>
              <TBody>
                {rows.map((d) => {
                  const status = displayStatus(d, today);
                  return (
                    <TR key={d.id}>
                      <TD>
                        <Link href={documentPath(d.type, d.id)} className="font-medium text-zinc-900 hover:text-brand-700">
                          {d.number ?? <span className="italic text-zinc-500">Draft</span>}
                        </Link>
                      </TD>
                      <TD>
                        <Link href={`/clients/${d.clientId}`} className="text-zinc-700 hover:text-brand-700">
                          {d.clientName}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap text-zinc-600">{formatDate(d.issueDate)}</TD>
                      {type === "invoice" ? <TD className="whitespace-nowrap text-zinc-600">{formatDate(d.dueDate)}</TD> : null}
                      {type === "quote" ? <TD className="whitespace-nowrap text-zinc-600">{formatDate(d.validUntil)}</TD> : null}
                      <TD>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </TD>
                      <TD align="right" className="whitespace-nowrap font-medium">
                        {formatMoney(d.total, d.currency)}
                      </TD>
                      {type === "invoice" ? (
                        <TD align="right" className="whitespace-nowrap text-zinc-600">
                          {d.status === "draft" || d.status === "void" ? "—" : formatMoney(dec(d.balanceDue).isNegative() ? 0 : d.balanceDue, d.currency)}
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
          </>
        )}
      </Card>
    </>
  );
}
