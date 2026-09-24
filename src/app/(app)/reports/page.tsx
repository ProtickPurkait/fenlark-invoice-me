import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DateRangeFilter } from "@/components/app/date-range";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { financialYear, formatDate, isValidDateString, todayIST } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { AGING_BUCKETS, gstr1Sheets, receivablesByClient, salesRegister, tdsRows } from "@/lib/reports/queries";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  await requireUser();
  const sp = await props.searchParams;
  const today = todayIST();
  const fy = financialYear(today);
  const from = typeof sp.from === "string" && isValidDateString(sp.from) ? sp.from : fy.start;
  const to = typeof sp.to === "string" && isValidDateString(sp.to) ? sp.to : fy.end;
  const qs = `from=${from}&to=${to}`;

  const [gstr1, sales, tds, receivables] = await Promise.all([gstr1Sheets(from, to), salesRegister(from, to), tdsRows(from, to), receivablesByClient(today)]);
  const count = (name: string) => gstr1.find((s) => s.name === name)?.rows.length ?? 0;
  const col = (sheetName: string, column: string) => {
    const sheet = gstr1.find((s) => s.name === sheetName)!;
    const i = sheet.columns.indexOf(column);
    return sheet.rows.reduce((sum, r) => sum + Number(r[i] ?? 0), 0);
  };
  const salesCol = (column: string) => {
    const i = sales.columns.indexOf(column);
    return sales.rows.reduce((sum, r) => sum + Number(r[i] ?? 0), 0);
  };
  const tdsByQuarter = new Map<string, number>();
  for (const r of tds) tdsByQuarter.set(r.quarter, (tdsByQuarter.get(r.quarter) ?? 0) + Number(r.tds));
  const agingTotals = [0, 0, 0, 0, 0];
  receivables.forEach((r) => r.buckets.forEach((b, i) => (agingTotals[i] += b)));

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${formatDate(from)} – ${formatDate(to)} · all amounts in INR`}
        actions={
          <Button variant="outline" asChild>
            <a href="/api/reports/export" download>
              <Download /> Export all data
            </a>
          </Button>
        }
      />
      <div className="mb-6">
        <DateRangeFilter from={from} to={to} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="GSTR-1"
            description="Outward supplies in the GST offline-tool layout: B2B, B2CL, B2CS, exports, credit/debit notes, HSN and document summary."
            action={<DownloadButton href={`/api/reports/gstr1?${qs}`} />}
          />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Stat label="B2B rows" value={String(count("b2b"))} />
              <Stat label="B2B taxable" value={formatMoney(col("b2b", "Taxable Value"))} />
              <Stat label="B2C large rows" value={String(count("b2cl"))} />
              <Stat label="B2C small taxable" value={formatMoney(col("b2cs", "Taxable Value"))} />
              <Stat label="Exports taxable" value={formatMoney(col("exp", "Taxable Value"))} />
              <Stat label="Notes (reg. / unreg.)" value={`${count("cdnr")} / ${count("cdnur")}`} />
            </dl>
            <p className="mt-4 text-xs text-zinc-500">
              Review before filing. Void documents are excluded and counted as cancelled in the “docs” sheet. Export rows need
              shipping-bill details added for goods.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sales register" description="Invoices, credit and debit notes with tax split." action={<DownloadButton href={`/api/reports/sales?${qs}`} />} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Stat label="Documents" value={String(sales.rows.length)} />
              <Stat label="Taxable value" value={formatMoney(salesCol("Taxable (INR)"))} />
              <Stat label="CGST + SGST" value={formatMoney(salesCol("CGST (INR)") + salesCol("SGST (INR)"))} />
              <Stat label="IGST" value={formatMoney(salesCol("IGST (INR)"))} />
              <Stat label="Total" value={formatMoney(salesCol("Total (INR)"))} />
            </dl>
            <div className="mt-4">
              <Link href={`/api/reports/payments?${qs}`} className="text-sm font-medium text-brand-700 hover:underline">
                Download payments received →
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="TDS receivable"
            description="Tax your clients deducted. Match it against Form 26AS / AIS before claiming credit."
            action={<DownloadButton href={`/api/reports/tds?${qs}`} />}
          />
          {tdsByQuarter.size === 0 ? (
            <CardBody>
              <p className="text-sm text-zinc-500">No TDS recorded in this period.</p>
            </CardBody>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Quarter</TH>
                  <TH align="right">TDS</TH>
                </tr>
              </THead>
              <TBody>
                {[...tdsByQuarter.entries()].map(([q, v]) => (
                  <TR key={q}>
                    <TD>{q}</TD>
                    <TD align="right">{formatMoney(v)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Receivables aging" description="Unpaid invoices today, by days overdue." action={<DownloadButton href="/api/reports/receivables" />} />
          <CardBody>
            <div className="grid grid-cols-5 gap-2 text-center">
              {AGING_BUCKETS.map((label, i) => (
                <div key={label} className="rounded-md bg-zinc-50 px-2 py-3">
                  <p className="text-[11px] text-zinc-500">{label}</p>
                  <p className={`mt-1 text-sm font-semibold tabular ${i >= 3 && agingTotals[i] > 0 ? "text-red-600" : "text-zinc-900"}`}>{formatMoney(agingTotals[i]).replace(".00", "")}</p>
                </div>
              ))}
            </div>
          </CardBody>
          {receivables.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>Client</TH>
                  <TH align="right">Overdue</TH>
                  <TH align="right">Total</TH>
                </tr>
              </THead>
              <TBody>
                {receivables.slice(0, 8).map((r) => (
                  <TR key={r.clientId}>
                    <TD>
                      <Link href={`/clients/${r.clientId}`} className="hover:text-brand-700">
                        {r.name}
                      </Link>
                    </TD>
                    <TD align="right" className={r.buckets.slice(1).some((b) => b > 0) ? "text-red-600" : "text-zinc-500"}>
                      {formatMoney(r.buckets.slice(1).reduce((a, b) => a + b, 0))}
                    </TD>
                    <TD align="right">{formatMoney(r.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function DownloadButton({ href }: { href: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={href} download>
        <Download /> Excel
      </a>
    </Button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-medium tabular text-zinc-900">{value}</dd>
    </div>
  );
}
