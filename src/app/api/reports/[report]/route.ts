import { getCurrentUser } from "@/lib/auth/session";
import { financialYear, isValidDateString, todayIST } from "@/lib/dates";
import { sheetsToXlsx, xlsxResponse } from "@/lib/reports/excel";
import { fullExportSheets, gstr1Sheets, paymentsSheet, receivablesSheet, salesRegister, tdsSheet } from "@/lib/reports/queries";

/** Excel downloads: /api/reports/{gstr1|sales|payments|tds|receivables|export}?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[report]">) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { report } = await ctx.params;
  const url = new URL(request.url);
  const today = todayIST();
  const fy = financialYear(today);
  const from = isValidDateString(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : fy.start;
  const to = isValidDateString(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : today;
  const period = `${from}_to_${to}`;

  switch (report) {
    case "gstr1":
      return xlsxResponse(await sheetsToXlsx(await gstr1Sheets(from, to), { title: `GSTR-1 ${period}` }), `GSTR-1_${period}.xlsx`);
    case "sales":
      return xlsxResponse(await sheetsToXlsx([await salesRegister(from, to)], { title: `Sales register ${period}` }), `Sales-register_${period}.xlsx`);
    case "payments":
      return xlsxResponse(await sheetsToXlsx([await paymentsSheet(from, to)], { title: `Payments ${period}` }), `Payments_${period}.xlsx`);
    case "tds":
      return xlsxResponse(await sheetsToXlsx([await tdsSheet(from, to)], { title: `TDS ${period}` }), `TDS-receivable_${period}.xlsx`);
    case "receivables":
      return xlsxResponse(await sheetsToXlsx(await receivablesSheet(today), { title: `Receivables ${today}` }), `Receivables_${today}.xlsx`);
    case "export":
      return xlsxResponse(await sheetsToXlsx(await fullExportSheets(), { title: `Fenlark billing export ${today}` }), `Fenlark-billing-export_${today}.xlsx`);
    default:
      return new Response("Unknown report", { status: 404 });
  }
}
