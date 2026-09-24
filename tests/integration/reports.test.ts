import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { issueDocument, saveDraft } from "@/lib/documents/service";
import { recordPayment } from "@/lib/payments/service";
import { sheetsToXlsx } from "@/lib/reports/excel";
import { dashboardData, fullExportSheets, gstr1Sheets, receivablesByClient, salesRegister, tdsRows } from "@/lib/reports/queries";
import { draftInput, gstin, seedBusiness, seedClient, seedUser } from "../helpers/fixtures";
import { setupTestDb, teardownTestDb } from "../helpers/db";

describe("reports", () => {
  beforeEach(async () => {
    await setupTestDb();
    await seedBusiness();
  });
  afterAll(teardownTestDb);

  it("builds GSTR-1, TDS, sales, receivables and dashboard figures from real documents", async () => {
    const actor = await seedUser();
    const b2b = await seedClient({ tan: "BLRA12345B" });
    const b2c = await seedClient({ name: "Ravi Kumar", kind: "individual", gstin: "", stateCode: "27" });
    const mh = await seedClient({ name: "Mumbai Co", stateCode: "27", gstin: gstin("27", "AABCM2222C") });

    const inv1 = await issueDocument(actor, await saveDraft(actor, null, draftInput(b2b.id, { issueDate: "2026-09-05", dueDate: "2026-09-20" })));
    await issueDocument(actor, await saveDraft(actor, null, draftInput(b2c.id, { issueDate: "2026-09-06", placeOfSupply: "27" })));
    await issueDocument(actor, await saveDraft(actor, null, draftInput(mh.id, { issueDate: "2026-09-07", placeOfSupply: "27" })));
    await recordPayment(actor, { documentId: inv1.id, kind: "payment", date: "2026-09-15", amount: "10800", tdsAmount: "1000", tdsSection: "194J", method: "bank_transfer", reference: "", notes: "" });

    const sheets = await gstr1Sheets("2026-09-01", "2026-09-30");
    const rows = (name: string) => sheets.find((s) => s.name === name)!.rows;
    expect(rows("b2b")).toHaveLength(2);
    expect(rows("b2cs")).toEqual([["OE", "27-Maharashtra", "", 18, 10000, 0, ""]]);
    expect(rows("docs")[0]).toEqual(["Invoices for outward supply", "FL/26-27/0001", "FL/26-27/0003", 3, 0]);

    const xlsx = await sheetsToXlsx(sheets, { title: "GSTR-1" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["b2b", "b2cl", "b2cs", "exp", "cdnr", "cdnur", "hsn(b2b)", "hsn(b2c)", "docs"]);
    expect(wb.getWorksheet("b2b")!.getRow(1).getCell(1).value).toBe("GSTIN/UIN of Recipient");

    expect(await tdsRows("2026-04-01", "2027-03-31")).toEqual([
      expect.objectContaining({ quarter: "Q2 FY26-27", tan: "BLRA12345B", pan: "AABCA1111B", section: "194J", tds: "1000.00", amountPaid: "10800.00" }),
    ]);
    expect((await salesRegister("2026-09-01", "2026-09-30")).rows).toHaveLength(3);

    const aging = await receivablesByClient("2026-10-15");
    expect(aging.map((a) => a.name).sort()).toEqual(["Mumbai Co", "Ravi Kumar"]);

    const d = await dashboardData("2026-10-15");
    expect(d.outstanding).toBe(23600);
    expect(d.salesFy).toBe(30000);
    expect(d.receivedFy).toBe(10800);
    expect(d.months).toHaveLength(12);
    expect(d.months.find((m) => m.month === "2026-09")).toMatchObject({ invoiced: 35400, received: 11800 });

    const exportSheets = await fullExportSheets();
    expect(exportSheets.find((s) => s.name === "Documents")!.rows).toHaveLength(3);
  });
});
