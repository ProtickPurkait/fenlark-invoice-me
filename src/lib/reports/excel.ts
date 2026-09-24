import ExcelJS from "exceljs";
import type { Sheet } from "./gstr1";

/** Write simple tabular sheets to an .xlsx buffer: bold frozen header, sized columns. */
export async function sheetsToXlsx(sheets: Sheet[], meta: { title: string; creator?: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.creator ?? "Fenlark Billing";
  wb.title = meta.title;
  wb.created = new Date();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(sheet.columns);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
    for (const row of sheet.rows) ws.addRow(row);
    sheet.columns.forEach((name, i) => {
      const col = ws.getColumn(i + 1);
      const longest = Math.max(name.length, ...sheet.rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
      col.width = Math.min(Math.max(longest + 2, 10), 60);
      if (sheet.rows.some((r) => typeof r[i] === "number" && !Number.isInteger(r[i]))) col.numFmt = "#,##0.00";
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
