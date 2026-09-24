import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { daysBetween, financialYear, formatDate, monthRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { activityLog, clients, documentLines, documents, items, payments } from "@/lib/db/schema";
import { DOC_LABELS, NOTE_REASONS, paymentMethodLabel } from "@/lib/documents/types";
import { dec, money } from "@/lib/money";
import { placeOfSupplyLabel } from "@/lib/tax/gst";
import { buildGstr1, type Gstr1Doc, type Sheet } from "./gstr1";

const ISSUED = ["issued", "partially_paid", "paid", "accepted", "declined", "converted"] as const;

function inr(amount: string, rate: string): number {
  return Number(money(dec(amount).times(rate)));
}

// ─── GSTR-1 ──────────────────────────────────────────────────────────────────

export async function gstr1Documents(from: string, to: string): Promise<Gstr1Doc[]> {
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        inArray(documents.type, ["invoice", "credit_note", "debit_note"]),
        ne(documents.status, "draft"),
        gte(documents.issueDate, from),
        lte(documents.issueDate, to),
      ),
    )
    .orderBy(asc(documents.issueDate), asc(documents.number));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const relatedIds = [...new Set(rows.map((r) => r.relatedDocumentId).filter((x): x is string => Boolean(x)))];
  const [lines, originals] = await Promise.all([
    db.select().from(documentLines).where(inArray(documentLines.documentId, ids)),
    relatedIds.length ? db.select().from(documents).where(inArray(documents.id, relatedIds)) : Promise.resolve([]),
  ]);
  const linesByDoc = new Map<string, typeof lines>();
  for (const l of lines) linesByDoc.set(l.documentId, [...(linesByDoc.get(l.documentId) ?? []), l]);
  const originalById = new Map(originals.map((o) => [o.id, o]));

  return rows.map((d) => {
    const orig = d.relatedDocumentId ? originalById.get(d.relatedDocumentId) : undefined;
    return {
      type: d.type,
      number: d.number ?? "",
      issueDate: d.issueDate,
      status: d.status,
      total: d.total,
      exchangeRate: d.exchangeRate,
      supplyType: d.supplyType,
      exportTax: d.exportTax,
      placeOfSupply: d.placeOfSupply,
      reverseCharge: d.reverseCharge,
      clientName: d.clientSnapshot?.name ?? "",
      clientGstin: d.clientSnapshot?.gstin ?? "",
      original: orig
        ? { total: orig.total, exchangeRate: orig.exchangeRate, supplyType: orig.supplyType, clientGstin: orig.clientSnapshot?.gstin ?? "", exportTax: orig.exportTax }
        : null,
      lines: (linesByDoc.get(d.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((l) => ({
          hsnSac: l.hsnSac,
          description: l.name,
          unit: l.unit,
          quantity: l.quantity,
          gstRate: l.gstRate,
          taxable: l.taxable,
          cgst: l.cgst,
          sgst: l.sgst,
          igst: l.igst,
        })),
    };
  });
}

export async function gstr1Sheets(from: string, to: string): Promise<Sheet[]> {
  return buildGstr1(await gstr1Documents(from, to));
}

// ─── Sales register ──────────────────────────────────────────────────────────

export async function salesRegister(from: string, to: string): Promise<Sheet> {
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        inArray(documents.type, ["invoice", "credit_note", "debit_note"]),
        ne(documents.status, "draft"),
        gte(documents.issueDate, from),
        lte(documents.issueDate, to),
      ),
    )
    .orderBy(asc(documents.issueDate), asc(documents.number));
  return {
    name: "Sales register",
    columns: ["Date", "Type", "Number", "Status", "Client", "GSTIN", "Place of supply", "Supply", "Currency", "Exchange rate", "Taxable (INR)", "CGST (INR)", "SGST (INR)", "IGST (INR)", "Total (INR)", "Total (doc currency)", "Reason"],
    rows: rows.map((d) => {
      const sign = d.type === "credit_note" ? -1 : 1;
      const v = (x: string) => (d.status === "void" ? 0 : sign * inr(x, d.exchangeRate));
      return [
        d.issueDate,
        DOC_LABELS[d.type].singular,
        d.number ?? "",
        d.status === "void" ? "Void" : "Issued",
        d.clientSnapshot?.name ?? "",
        d.clientSnapshot?.gstin ?? "",
        placeOfSupplyLabel(d.placeOfSupply),
        d.supplyType,
        d.currency,
        Number(d.exchangeRate),
        v(d.taxableTotal),
        v(d.cgstTotal),
        v(d.sgstTotal),
        v(d.igstTotal),
        v(d.total),
        d.status === "void" ? 0 : sign * Number(d.total),
        d.noteReason ? (NOTE_REASONS.find((r) => r.value === d.noteReason)?.label ?? "") : d.voidReason ?? "",
      ];
    }),
  };
}

// ─── Payments & TDS ──────────────────────────────────────────────────────────

export async function paymentRows(from: string, to: string) {
  return db
    .select({ payment: payments, number: documents.number, currency: documents.currency, exchangeRate: documents.exchangeRate, client: clients })
    .from(payments)
    .innerJoin(documents, eq(documents.id, payments.documentId))
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(and(gte(payments.date, from), lte(payments.date, to)))
    .orderBy(asc(payments.date), asc(payments.createdAt));
}

export async function paymentsSheet(from: string, to: string): Promise<Sheet> {
  const rows = await paymentRows(from, to);
  return {
    name: "Payments",
    columns: ["Date", "Client", "Invoice", "Kind", "Method", "Reference", "Currency", "Amount", "TDS", "Amount (INR)", "TDS (INR)", "Gateway payment ID", "Notes"],
    rows: rows.map(({ payment: p, number, currency, exchangeRate, client }) => {
      const sign = p.kind === "refund" ? -1 : 1;
      return [
        p.date,
        client.name,
        number ?? "",
        p.kind,
        p.gateway ? `Online (${p.gateway})` : paymentMethodLabel(p.method),
        p.reference,
        currency,
        sign * Number(p.amount),
        Number(p.tdsAmount),
        sign * inr(p.amount, exchangeRate),
        inr(p.tdsAmount, exchangeRate),
        p.gatewayPaymentId ?? "",
        p.notes,
      ];
    }),
  };
}

export function quarterOf(date: string): string {
  const fy = financialYear(date);
  const m = Number(date.slice(5, 7));
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 && m <= 12 ? 3 : 4;
  return `Q${q} FY${fy.short}`;
}

export interface TdsRow {
  date: string;
  quarter: string;
  clientName: string;
  pan: string;
  tan: string;
  section: string;
  invoice: string;
  amountPaid: string;
  tds: string;
}

export async function tdsRows(from: string, to: string): Promise<TdsRow[]> {
  const rows = await db
    .select({ payment: payments, number: documents.number, exchangeRate: documents.exchangeRate, client: clients, snapshot: documents.clientSnapshot })
    .from(payments)
    .innerJoin(documents, eq(documents.id, payments.documentId))
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(and(gte(payments.date, from), lte(payments.date, to), gt(payments.tdsAmount, "0")))
    .orderBy(asc(payments.date));
  return rows.map(({ payment: p, number, exchangeRate, client, snapshot }) => ({
    date: p.date,
    quarter: quarterOf(p.date),
    clientName: client.name,
    pan: client.pan || snapshot?.pan || (client.gstin ? client.gstin.slice(2, 12) : ""),
    tan: client.tan,
    section: p.tdsSection || client.tdsSection,
    invoice: number ?? "",
    amountPaid: money(dec(p.amount).times(exchangeRate)),
    tds: money(dec(p.tdsAmount).times(exchangeRate)),
  }));
}

export async function tdsSheet(from: string, to: string): Promise<Sheet> {
  const rows = await tdsRows(from, to);
  return {
    name: "TDS receivable",
    columns: ["Payment date", "Quarter", "Deductor (client)", "Client PAN", "Client TAN", "Section", "Invoice", "Amount received (INR)", "TDS (INR)"],
    rows: rows.map((r) => [r.date, r.quarter, r.clientName, r.pan, r.tan, r.section, r.invoice, Number(r.amountPaid), Number(r.tds)]),
  };
}

// ─── Receivables ─────────────────────────────────────────────────────────────

export const AGING_BUCKETS = ["Not due", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;

export function agingBucket(dueDate: string | null, today: string): number {
  if (!dueDate || dueDate >= today) return 0;
  const days = daysBetween(dueDate, today);
  if (days <= 30) return 1;
  if (days <= 60) return 2;
  if (days <= 90) return 3;
  return 4;
}

export async function openInvoices() {
  return db
    .select({ doc: documents, clientName: clients.name })
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(and(eq(documents.type, "invoice"), inArray(documents.status, ["issued", "partially_paid"]), gt(documents.balanceDue, "0")))
    .orderBy(asc(documents.dueDate));
}

export async function receivablesByClient(today: string) {
  const open = await openInvoices();
  const byClient = new Map<string, { clientId: string; name: string; buckets: number[]; total: number; invoices: number }>();
  for (const { doc, clientName } of open) {
    const row = byClient.get(doc.clientId) ?? { clientId: doc.clientId, name: clientName, buckets: [0, 0, 0, 0, 0], total: 0, invoices: 0 };
    const amount = inr(doc.balanceDue, doc.exchangeRate);
    row.buckets[agingBucket(doc.dueDate, today)] += amount;
    row.total += amount;
    row.invoices += 1;
    byClient.set(doc.clientId, row);
  }
  return [...byClient.values()].sort((a, b) => b.total - a.total);
}

export async function receivablesSheet(today: string): Promise<Sheet[]> {
  const open = await openInvoices();
  const summary = await receivablesByClient(today);
  return [
    {
      name: "Aging by client",
      columns: ["Client", "Invoices", ...AGING_BUCKETS, "Total (INR)"],
      rows: summary.map((r) => [r.name, r.invoices, ...r.buckets.map((b) => Number(b.toFixed(2))), Number(r.total.toFixed(2))]),
    },
    {
      name: "Open invoices",
      columns: ["Invoice", "Client", "Date", "Due date", "Days overdue", "Currency", "Total", "Balance", "Balance (INR)"],
      rows: open.map(({ doc, clientName }) => [
        doc.number ?? "",
        clientName,
        doc.issueDate,
        doc.dueDate ?? "",
        doc.dueDate && doc.dueDate < today ? daysBetween(doc.dueDate, today) : 0,
        doc.currency,
        Number(doc.total),
        Number(doc.balanceDue),
        inr(doc.balanceDue, doc.exchangeRate),
      ]),
    },
  ];
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function dashboardData(today: string) {
  const fy = financialYear(today);
  const month = monthRange(today.slice(0, 7));
  const start12 = `${addMonthsStart(today, -11)}`;

  const [[invoiced], [received], monthlyInvoiced, monthlyReceived, aging, recent, topClients, [counts]] = await Promise.all([
    db
      .select({
        taxableFy: sql<string>`coalesce(sum(${documents.taxableTotal} * ${documents.exchangeRate}) filter (where ${documents.type} = 'invoice'), 0) - coalesce(sum(${documents.taxableTotal} * ${documents.exchangeRate}) filter (where ${documents.type} = 'credit_note'), 0) + coalesce(sum(${documents.taxableTotal} * ${documents.exchangeRate}) filter (where ${documents.type} = 'debit_note'), 0)`,
        taxFy: sql<string>`coalesce(sum(${documents.taxTotal} * ${documents.exchangeRate}) filter (where ${documents.type} = 'invoice' and not ${documents.reverseCharge}), 0) - coalesce(sum(${documents.taxTotal} * ${documents.exchangeRate}) filter (where ${documents.type} = 'credit_note' and not ${documents.reverseCharge}), 0) + coalesce(sum(${documents.taxTotal} * ${documents.exchangeRate}) filter (where ${documents.type} = 'debit_note' and not ${documents.reverseCharge}), 0)`,
      })
      .from(documents)
      .where(and(inArray(documents.type, ["invoice", "credit_note", "debit_note"]), inArray(documents.status, [...ISSUED]), gte(documents.issueDate, fy.start), lte(documents.issueDate, fy.end))),
    db
      .select({
        month: sql<string>`coalesce(sum(case when ${payments.kind} = 'refund' then -${payments.amount} else ${payments.amount} end * ${documents.exchangeRate}) filter (where ${payments.date} >= ${month.start}), 0)`,
        fy: sql<string>`coalesce(sum(case when ${payments.kind} = 'refund' then -${payments.amount} else ${payments.amount} end * ${documents.exchangeRate}), 0)`,
      })
      .from(payments)
      .innerJoin(documents, eq(documents.id, payments.documentId))
      .where(and(gte(payments.date, fy.start), lte(payments.date, fy.end))),
    db
      .select({
        month: sql<string>`to_char(${documents.issueDate}, 'YYYY-MM')`,
        total: sql<string>`sum(${documents.total} * ${documents.exchangeRate})`,
      })
      .from(documents)
      .where(and(eq(documents.type, "invoice"), inArray(documents.status, [...ISSUED]), gte(documents.issueDate, start12)))
      .groupBy(sql`1`),
    db
      .select({
        month: sql<string>`to_char(${payments.date}, 'YYYY-MM')`,
        total: sql<string>`sum((case when ${payments.kind} = 'refund' then -${payments.amount} else ${payments.amount} end + ${payments.tdsAmount}) * ${documents.exchangeRate})`,
      })
      .from(payments)
      .innerJoin(documents, eq(documents.id, payments.documentId))
      .where(gte(payments.date, start12))
      .groupBy(sql`1`),
    receivablesByClient(today),
    db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(8),
    db
      .select({ clientId: documents.clientId, name: clients.name, total: sql<string>`sum(${documents.taxableTotal} * ${documents.exchangeRate})` })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .where(and(eq(documents.type, "invoice"), inArray(documents.status, [...ISSUED]), gte(documents.issueDate, fy.start)))
      .groupBy(documents.clientId, clients.name)
      .orderBy(desc(sql`3`))
      .limit(5),
    db
      .select({
        clients: sql<number>`(select count(*)::int from ${clients})`,
        items: sql<number>`(select count(*)::int from ${items})`,
        invoices: sql<number>`(select count(*)::int from ${documents} where ${documents.type} = 'invoice' and ${documents.status} <> 'draft')`,
        drafts: sql<number>`(select count(*)::int from ${documents} where ${documents.status} = 'draft')`,
      })
      .from(sql`(select 1) as one`),
  ]);

  const buckets = [0, 0, 0, 0, 0];
  let outstanding = 0;
  for (const row of aging) {
    row.buckets.forEach((b, i) => (buckets[i] += b));
    outstanding += row.total;
  }
  const months: { month: string; label: string; invoiced: number; received: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const key = addMonthsStart(today, -i).slice(0, 7);
    months.push({
      month: key,
      label: formatDate(`${key}-01`).split(" ").slice(1).join(" "),
      invoiced: Number(monthlyInvoiced.find((m) => m.month === key)?.total ?? 0),
      received: Number(monthlyReceived.find((m) => m.month === key)?.total ?? 0),
    });
  }
  return {
    fy,
    outstanding,
    overdue: buckets.slice(1).reduce((a, b) => a + b, 0),
    overdueClients: aging.filter((a) => a.buckets.slice(1).some((b) => b > 0)).length,
    buckets,
    receivedMonth: Number(received.month),
    receivedFy: Number(received.fy),
    salesFy: Number(invoiced.taxableFy),
    taxFy: Number(invoiced.taxFy),
    months,
    recent,
    topClients: topClients.map((t) => ({ ...t, total: Number(t.total) })),
    topDebtors: aging.slice(0, 5),
    counts,
  };
}

function addMonthsStart(date: string, months: number): string {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

// ─── Full export ─────────────────────────────────────────────────────────────

export async function fullExportSheets(): Promise<Sheet[]> {
  const [clientRows, itemRows, docRows, lineRows, paymentRowsAll] = await Promise.all([
    db.select().from(clients).orderBy(asc(clients.name)),
    db.select().from(items).orderBy(asc(items.name)),
    db.select({ doc: documents, clientName: clients.name }).from(documents).innerJoin(clients, eq(clients.id, documents.clientId)).orderBy(asc(documents.issueDate)),
    db.select({ line: documentLines, number: documents.number, type: documents.type }).from(documentLines).innerJoin(documents, eq(documents.id, documentLines.documentId)),
    db.select({ p: payments, number: documents.number }).from(payments).innerJoin(documents, eq(documents.id, payments.documentId)).orderBy(asc(payments.date)),
  ]);
  return [
    {
      name: "Clients",
      columns: ["ID", "Name", "Type", "Contact", "Email", "CC", "Phone", "GSTIN", "PAN", "TAN", "SEZ", "Address 1", "Address 2", "City", "PIN", "State", "Country", "Currency", "Terms (days)", "TDS rate", "TDS section", "Archived"],
      rows: clientRows.map((c) => [c.id, c.name, c.kind, c.contactName, c.email, c.ccEmails.join(", "), c.phone, c.gstin, c.pan, c.tan, c.isSez ? "Yes" : "No", c.addressLine1, c.addressLine2, c.city, c.postalCode, c.stateCode, c.country, c.currency, c.paymentTermsDays ?? "", c.tdsRate ?? "", c.tdsSection, c.archivedAt ? "Yes" : "No"]),
    },
    {
      name: "Items",
      columns: ["ID", "Name", "Type", "HSN/SAC", "Unit", "Rate", "GST %", "Description", "Archived"],
      rows: itemRows.map((i) => [i.id, i.name, i.kind, i.hsnSac, i.unit, Number(i.rate), Number(i.gstRate), i.description, i.archivedAt ? "Yes" : "No"]),
    },
    {
      name: "Documents",
      columns: ["ID", "Type", "Number", "Status", "Date", "Due", "Client", "Currency", "Exchange rate", "Place of supply", "Supply", "Export tax", "Reverse charge", "Taxable", "CGST", "SGST", "IGST", "Round off", "Total", "Paid", "TDS", "Credited", "Debited", "Balance", "Related ID", "Reference", "Notes", "Void reason"],
      rows: docRows.map(({ doc: d, clientName }) => [d.id, d.type, d.number ?? "", d.status, d.issueDate, d.dueDate ?? d.validUntil ?? "", clientName, d.currency, Number(d.exchangeRate), d.placeOfSupply ?? "", d.supplyType, d.exportTax ?? "", d.reverseCharge ? "Y" : "N", Number(d.taxableTotal), Number(d.cgstTotal), Number(d.sgstTotal), Number(d.igstTotal), Number(d.roundOff), Number(d.total), Number(d.amountPaid), Number(d.tdsAmount), Number(d.creditedTotal), Number(d.debitedTotal), Number(d.balanceDue), d.relatedDocumentId ?? "", d.reference, d.notes, d.voidReason ?? ""]),
    },
    {
      name: "Lines",
      columns: ["Document ID", "Document", "#", "Item", "Description", "HSN/SAC", "Qty", "Unit", "Rate", "Discount", "GST %", "Taxable", "CGST", "SGST", "IGST", "Total"],
      rows: lineRows.map(({ line: l, number, type }) => [l.documentId, `${DOC_LABELS[type].singular} ${number ?? "(draft)"}`, l.position + 1, l.name, l.description, l.hsnSac, Number(l.quantity), l.unit, Number(l.rate), Number(l.discount), Number(l.gstRate), Number(l.taxable), Number(l.cgst), Number(l.sgst), Number(l.igst), Number(l.total)]),
    },
    {
      name: "Payments",
      columns: ["ID", "Invoice", "Kind", "Date", "Amount", "TDS", "TDS section", "Method", "Reference", "Gateway", "Gateway payment ID", "Notes"],
      rows: paymentRowsAll.map(({ p, number }) => [p.id, number ?? "", p.kind, p.date, Number(p.amount), Number(p.tdsAmount), p.tdsSection, p.method, p.reference, p.gateway ?? "", p.gatewayPaymentId ?? "", p.notes]),
    },
  ];
}
