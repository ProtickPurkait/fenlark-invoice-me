/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> renders into the PDF and has no alt attribute. */
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { TaxSummaryRow } from "@/lib/calc/document";
import { countryName } from "@/lib/countries";
import type { ClientSnapshot, DocumentType, SellerSnapshot } from "@/lib/documents/types";
import { formatAmount, formatMoney, formatQty } from "@/lib/money";
import { placeOfSupplyLabel, stateName, type TaxSplit } from "@/lib/tax/gst";

/**
 * Printable document (A4). Pure component: all data — including images as
 * data URIs — is resolved by the caller (see render.ts), so it can also be
 * rendered from scripts and tests.
 */

let fontsRegistered = false;
export function registerFonts(): void {
  if (fontsRegistered) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(dir, "Inter-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Inter-Medium.ttf"), fontWeight: 500 },
      { src: path.join(dir, "Inter-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(dir, "Inter-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Never hyphenate names, GSTINs or numbers.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

export interface PdfLine {
  name: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unit: string;
  rate: string;
  discount: string;
  taxable: string;
  gstRate: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

export interface PdfData {
  type: DocumentType;
  title: string;
  copyLabel: string | null;
  number: string;
  draft: boolean;
  void: boolean;
  meta: { label: string; value: string }[];
  seller: SellerSnapshot;
  client: ClientSnapshot;
  placeOfSupply: string | null;
  supplyLabel: string;
  split: TaxSplit;
  reverseCharge: boolean;
  gstDocument: boolean;
  currency: string;
  exchangeRate: string;
  lines: PdfLine[];
  totals: {
    subtotal: string;
    discountTotal: string;
    taxableTotal: string;
    cgstTotal: string;
    sgstTotal: string;
    igstTotal: string;
    taxTotal: string;
    roundOff: string;
    total: string;
  };
  inrTaxable: string | null;
  inrTotal: string | null;
  amountInWords: string;
  taxSummary: TaxSummaryRow[];
  declaration: string | null;
  related: { label: string; number: string; date: string } | null;
  noteReason: string | null;
  settlement: { label: string; value: string; strong?: boolean }[] | null;
  bank: { label: string; value: string }[] | null;
  upi: { qr: string; id: string; amount: string } | null;
  notes: string;
  terms: string;
  logo: string | null;
  signature: string | null;
  brandColor: string;
  footer: string;
}

const INK = "#18181b";
const MUTED = "#71717a";
const LINE = "#e4e4e7";
const SOFT = "#f4f4f5";

const s = StyleSheet.create({
  // No page-level lineHeight: it stops react-pdf from drawing the fixed footer's
  // dynamic page numbers. Inter's default line spacing reads well at this size.
  page: { fontFamily: "Inter", fontSize: 8.5, color: INK, paddingTop: 32, paddingBottom: 48, paddingHorizontal: 34 },
  row: { flexDirection: "row" },
  muted: { color: MUTED },
  bold: { fontWeight: 600 },
  h1: { fontSize: 18, fontWeight: 700, textAlign: "right", lineHeight: 1.1 },
  sellerName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  label: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3, fontWeight: 600 },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 8 },
  th: { fontSize: 7, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.3 },
  cell: { paddingVertical: 5, paddingHorizontal: 4 },
  right: { textAlign: "right" },
  watermark: {
    position: "absolute",
    top: 330,
    left: 60,
    fontSize: 110,
    fontWeight: 700,
    color: "#dc2626",
    opacity: 0.08,
    transform: "rotate(-30deg)",
  },
  footer: { position: "absolute", bottom: 22, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED },
});

function addressLines(p: { addressLine1: string; addressLine2: string; city: string; postalCode: string; stateCode: string; country: string }): string[] {
  const cityLine = [p.city, p.postalCode].filter(Boolean).join(" ");
  const region = p.country === "IN" ? [stateName(p.stateCode), p.stateCode ? `(${p.stateCode})` : ""].filter(Boolean).join(" ") : countryName(p.country);
  return [p.addressLine1, p.addressLine2, [cityLine, region].filter(Boolean).join(", ")].filter(Boolean);
}

interface Col {
  key: string;
  label: string;
  width: number | string;
  align?: "right";
  render: (l: PdfLine, i: number) => React.ReactNode;
}

function columns(d: PdfData): Col[] {
  const cur = d.currency;
  const showDiscount = d.lines.some((l) => Number(l.discount) > 0);
  const hasHsn = d.lines.some((l) => l.hsnSac);
  const cols: Col[] = [
    { key: "n", label: "#", width: 16, render: (_l, i) => String(i + 1) },
    {
      key: "item",
      label: "Item",
      width: "*",
      render: (l) => (
        <View>
          <Text style={s.bold}>{l.name}</Text>
          {l.description ? <Text style={[s.muted, { marginTop: 1 }]}>{l.description}</Text> : null}
        </View>
      ),
    },
  ];
  if (hasHsn) cols.push({ key: "hsn", label: "HSN/SAC", width: 46, render: (l) => l.hsnSac });
  cols.push(
    { key: "qty", label: "Qty", width: 44, align: "right", render: (l) => `${formatQty(l.quantity)}${l.unit && l.unit !== "OTH" ? ` ${l.unit}` : ""}` },
    { key: "rate", label: "Rate", width: 56, align: "right", render: (l) => formatAmount(l.rate, cur) },
  );
  if (showDiscount) cols.push({ key: "disc", label: "Disc.", width: 44, align: "right", render: (l) => (Number(l.discount) > 0 ? formatAmount(l.discount, cur) : "–") });
  if (d.split !== "none") cols.push({ key: "taxable", label: "Taxable", width: 58, align: "right", render: (l) => formatAmount(l.taxable, cur) });
  if (d.split === "cgst_sgst") {
    cols.push(
      { key: "cgst", label: "CGST", width: 50, align: "right", render: (l) => <TaxCell rate={Number(l.gstRate) / 2} amount={formatAmount(l.cgst, cur)} /> },
      { key: "sgst", label: "SGST", width: 50, align: "right", render: (l) => <TaxCell rate={Number(l.gstRate) / 2} amount={formatAmount(l.sgst, cur)} /> },
    );
  } else if (d.split === "igst") {
    cols.push({ key: "igst", label: "IGST", width: 56, align: "right", render: (l) => <TaxCell rate={Number(l.gstRate)} amount={formatAmount(l.igst, cur)} /> });
  }
  cols.push({ key: "amount", label: "Amount", width: 62, align: "right", render: (l) => formatAmount(l.total, cur) });
  return cols;
}

function TaxCell({ rate, amount }: { rate: number; amount: string }) {
  return (
    <View>
      <Text>{amount}</Text>
      <Text style={[s.muted, { fontSize: 6.5 }]}>{`${rate}%`}</Text>
    </View>
  );
}

function colStyle(c: Col) {
  return c.width === "*" ? { flex: 1 } : { width: c.width as number };
}

export function DocumentPdf({ data: d }: { data: PdfData }) {
  const brand = d.brandColor || "#0f766e";
  const cols = columns(d);
  const sellerName = d.seller.legalName || d.seller.tradeName;
  const showTrade = d.seller.tradeName && d.seller.tradeName !== d.seller.legalName;

  const totalRows: { label: string; value: string; strong?: boolean }[] = [];
  const cur = d.currency;
  if (Number(d.totals.discountTotal) > 0) {
    totalRows.push({ label: "Sub total", value: formatMoney(d.totals.subtotal, cur) });
    totalRows.push({ label: "Discount", value: `– ${formatMoney(d.totals.discountTotal, cur)}` });
  }
  totalRows.push({ label: d.split === "none" ? "Sub total" : "Taxable value", value: formatMoney(d.totals.taxableTotal, cur) });
  if (d.split === "cgst_sgst") {
    totalRows.push({ label: "CGST", value: formatMoney(d.totals.cgstTotal, cur) });
    totalRows.push({ label: "SGST / UTGST", value: formatMoney(d.totals.sgstTotal, cur) });
  } else if (d.split === "igst") {
    totalRows.push({ label: "IGST", value: formatMoney(d.totals.igstTotal, cur) });
  }
  if (d.reverseCharge && Number(d.totals.taxTotal) > 0) {
    totalRows.push({ label: "Tax payable by recipient (RCM)", value: `(${formatMoney(d.totals.taxTotal, cur)})` });
  }
  if (Number(d.totals.roundOff) !== 0) totalRows.push({ label: "Round off", value: formatMoney(d.totals.roundOff, cur) });

  return (
    <Document title={`${d.title} ${d.number}`} author={sellerName} creator="Fenlark Billing" producer="Fenlark Billing">
      <Page size="A4" style={s.page}>
        {d.void ? <Text style={s.watermark} fixed>VOID</Text> : d.draft ? <Text style={[s.watermark, { color: "#71717a" }]} fixed>DRAFT</Text> : null}
        <View style={s.footer} fixed>
          <Text>{d.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `${d.number} · Page ${pageNumber} of ${totalPages}`} />
        </View>

        {/* Header */}
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 14 }]}>
          <View style={{ width: "58%" }}>
            {d.logo ? <Image src={d.logo} style={{ maxHeight: 44, maxWidth: 150, objectFit: "contain", marginBottom: 8, alignSelf: "flex-start" }} /> : null}
            <Text style={s.sellerName}>{sellerName}</Text>
            {showTrade ? <Text style={s.muted}>{d.seller.tradeName}</Text> : null}
            {addressLines(d.seller).map((line) => (
              <Text key={line}>{line}</Text>
            ))}
            {d.seller.gstin ? (
              <Text style={{ marginTop: 2 }}>
                <Text style={s.bold}>GSTIN </Text>
                {d.seller.gstin}
                {d.seller.pan ? <Text style={s.muted}>{`   PAN ${d.seller.pan}`}</Text> : null}
              </Text>
            ) : d.seller.pan ? (
              <Text style={{ marginTop: 2 }}>PAN {d.seller.pan}</Text>
            ) : null}
            {d.seller.udyamNumber ? <Text style={s.muted}>Udyam {d.seller.udyamNumber}</Text> : null}
            <Text style={s.muted}>{[d.seller.email, d.seller.phone, d.seller.website].filter(Boolean).join("  ·  ")}</Text>
          </View>
          <View style={{ width: "40%", alignItems: "flex-end" }}>
            <Text style={[s.h1, { color: brand }]}>{d.title}</Text>
            {d.copyLabel ? <Text style={[s.muted, { fontSize: 7, marginTop: 1, textTransform: "uppercase", letterSpacing: 0.6 }]}>{d.copyLabel}</Text> : null}
            <View style={{ marginTop: 8, width: "100%" }}>
              <MetaRow label="Number" value={d.number} strong />
              {d.meta.map((m) => (
                <MetaRow key={m.label} label={m.label} value={m.value} />
              ))}
            </View>
          </View>
        </View>

        {/* Parties */}
        <View style={[s.row, { gap: 8, marginBottom: 12 }]}>
          <View style={[s.box, { flex: 1.25 }]}>
            <Text style={s.label}>Bill to</Text>
            <Text style={[s.bold, { fontSize: 9.5 }]}>{d.client.name}</Text>
            {d.client.contactName ? <Text>Attn: {d.client.contactName}</Text> : null}
            {addressLines(d.client).map((line) => (
              <Text key={line}>{line}</Text>
            ))}
            {d.client.gstin ? (
              <Text style={{ marginTop: 2 }}>
                <Text style={s.bold}>GSTIN </Text>
                {d.client.gstin}
                {d.client.isSez ? "  (SEZ)" : ""}
              </Text>
            ) : d.client.pan ? (
              <Text style={{ marginTop: 2 }}>PAN {d.client.pan}</Text>
            ) : null}
          </View>
          {d.client.shippingAddress ? (
            <View style={[s.box, { flex: 1 }]}>
              <Text style={s.label}>Ship to</Text>
              <Text>{d.client.shippingAddress}</Text>
            </View>
          ) : null}
          <View style={[s.box, { flex: 1 }]}>
            <Text style={s.label}>Supply</Text>
            {d.placeOfSupply ? <InfoRow label="Place of supply" value={placeOfSupplyLabel(d.placeOfSupply)} /> : null}
            {d.gstDocument ? <InfoRow label="Reverse charge" value={d.reverseCharge ? "Yes" : "No"} /> : null}
            <InfoRow label="Type" value={d.supplyLabel} />
            {d.currency !== "INR" ? <InfoRow label="Currency" value={`${d.currency} (1 ${d.currency} = ₹${Number(d.exchangeRate).toFixed(4)})`} /> : null}
            {d.related ? <InfoRow label={d.related.label} value={`${d.related.number} dt. ${d.related.date}`} /> : null}
            {d.noteReason ? <InfoRow label="Reason" value={d.noteReason} /> : null}
          </View>
        </View>

        {/* Items */}
        <View style={{ borderTopWidth: 1.5, borderTopColor: brand }}>
          <View style={[s.row, { backgroundColor: SOFT }]}>
            {cols.map((c) => (
              <Text key={c.key} style={[s.th, s.cell, colStyle(c), c.align === "right" ? s.right : {}]}>
                {c.label}
              </Text>
            ))}
          </View>
          {d.lines.map((l, i) => (
            <View key={i} style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: LINE }]} wrap={false}>
              {cols.map((c) => {
                const content = c.render(l, i);
                return (
                  <View key={c.key} style={[s.cell, colStyle(c), c.align === "right" ? { alignItems: "flex-end" } : {}]}>
                    {typeof content === "string" ? <Text style={c.align === "right" ? s.right : {}}>{content}</Text> : content}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={[s.row, { marginTop: 10, gap: 16 }]} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Amount in words</Text>
            <Text style={s.bold}>{d.amountInWords}</Text>
            {d.inrTotal ? (
              <Text style={[s.muted, { marginTop: 6 }]}>
                {`INR equivalent — taxable value ₹${d.inrTaxable}, total ₹${d.inrTotal}`}
              </Text>
            ) : null}
            {d.declaration ? (
              <View style={[s.box, { marginTop: 8, backgroundColor: "#fafafa" }]}>
                <Text style={[s.bold, { fontSize: 7.5 }]}>{d.declaration}</Text>
              </View>
            ) : null}
            {d.reverseCharge ? <Text style={[s.muted, { marginTop: 6 }]}>Tax is payable by the recipient under reverse charge.</Text> : null}
          </View>
          <View style={{ width: 210 }}>
            {totalRows.map((r) => (
              <TotalRow key={r.label} label={r.label} value={r.value} />
            ))}
            <View style={[s.row, { justifyContent: "space-between", borderTopWidth: 1, borderTopColor: INK, paddingTop: 5, marginTop: 3 }]}>
              <Text style={[s.bold, { fontSize: 10.5 }]}>Total</Text>
              <Text style={[s.bold, { fontSize: 10.5 }]}>{formatMoney(d.totals.total, cur)}</Text>
            </View>
            {d.settlement?.map((r) => (
              <TotalRow key={r.label} label={r.label} value={r.value} strong={r.strong} />
            ))}
          </View>
        </View>

        {/* HSN / SAC summary */}
        {/* One row would just repeat the totals, so the summary shows for mixed HSN codes / rates. */}
        {d.split !== "none" && d.taxSummary.length > 1 ? (
          <View style={{ marginTop: 14 }} wrap={false}>
            <Text style={s.label}>Tax summary</Text>
            <View style={[s.row, { backgroundColor: SOFT }]}>
              <Text style={[s.th, s.cell, { flex: 1 }]}>HSN/SAC</Text>
              <Text style={[s.th, s.cell, s.right, { width: 70 }]}>Taxable</Text>
              {d.split === "cgst_sgst" ? (
                <>
                  <Text style={[s.th, s.cell, s.right, { width: 80 }]}>CGST</Text>
                  <Text style={[s.th, s.cell, s.right, { width: 80 }]}>SGST</Text>
                </>
              ) : (
                <Text style={[s.th, s.cell, s.right, { width: 90 }]}>IGST</Text>
              )}
              <Text style={[s.th, s.cell, s.right, { width: 70 }]}>Total tax</Text>
            </View>
            {d.taxSummary.map((t) => (
              <View key={`${t.hsnSac}-${t.gstRate}`} style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: LINE }]}>
                <Text style={[s.cell, { flex: 1 }]}>{t.hsnSac || "—"}</Text>
                <Text style={[s.cell, s.right, { width: 70 }]}>{formatAmount(t.taxable, cur)}</Text>
                {d.split === "cgst_sgst" ? (
                  <>
                    <Text style={[s.cell, s.right, { width: 80 }]}>{`${formatAmount(t.cgst, cur)} @${Number(t.gstRate) / 2}%`}</Text>
                    <Text style={[s.cell, s.right, { width: 80 }]}>{`${formatAmount(t.sgst, cur)} @${Number(t.gstRate) / 2}%`}</Text>
                  </>
                ) : (
                  <Text style={[s.cell, s.right, { width: 90 }]}>{`${formatAmount(t.igst, cur)} @${Number(t.gstRate)}%`}</Text>
                )}
                <Text style={[s.cell, s.right, { width: 70 }]}>{formatAmount(t.tax, cur)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Payment details */}
        {d.bank || d.upi ? (
          <View style={[s.row, { marginTop: 14, gap: 8 }]} wrap={false}>
            {d.bank ? (
              <View style={[s.box, { flex: 1 }]}>
                <Text style={s.label}>Pay by bank transfer</Text>
                {d.bank.map((b) => (
                  <InfoRow key={b.label} label={b.label} value={b.value} />
                ))}
              </View>
            ) : null}
            {d.upi ? (
              <View style={[s.box, { width: 170, flexDirection: "row", gap: 8, alignItems: "center" }]}>
                <Image src={d.upi.qr} style={{ width: 72, height: 72 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Scan to pay (UPI)</Text>
                  <Text style={s.bold}>{d.upi.amount}</Text>
                  <Text style={[s.muted, { fontSize: 7 }]}>{d.upi.id}</Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Notes, terms, signature */}
        <View style={[s.row, { marginTop: 14, gap: 16 }]} wrap={false}>
          <View style={{ flex: 1 }}>
            {d.notes ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={s.label}>Notes</Text>
                <Text>{d.notes}</Text>
              </View>
            ) : null}
            {d.terms ? (
              <View>
                <Text style={s.label}>Terms & conditions</Text>
                <Text style={s.muted}>{d.terms}</Text>
              </View>
            ) : null}
          </View>
          {d.type !== "quote" || d.signature ? (
            <View style={{ width: 170, alignItems: "flex-end" }}>
              <Text style={[s.muted, { fontSize: 7.5 }]}>For {sellerName}</Text>
              {d.signature ? <Image src={d.signature} style={{ maxHeight: 44, maxWidth: 140, objectFit: "contain", marginVertical: 4 }} /> : <View style={{ height: 36 }} />}
              <Text style={s.bold}>{d.seller.signatoryName || "Authorised Signatory"}</Text>
              {d.seller.signatoryName ? <Text style={[s.muted, { fontSize: 7.5 }]}>Authorised Signatory</Text> : null}
            </View>
          ) : null}
        </View>

      </Page>
    </Document>
  );
}

function MetaRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={[s.row, { justifyContent: "flex-end", marginBottom: 1.5 }]}>
      <Text style={[s.muted, { width: 70, textAlign: "right", marginRight: 8 }]}>{label}</Text>
      <Text style={[{ width: 100, textAlign: "right" }, strong ? s.bold : {}]}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={[s.row, { marginBottom: 1.5 }]}>
      <Text style={[s.muted, { width: 72 }]}>{label}</Text>
      <Text style={{ flex: 1 }}>{value}</Text>
    </View>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={[s.row, { justifyContent: "space-between", paddingVertical: 2 }]}>
      <Text style={strong ? s.bold : s.muted}>{label}</Text>
      <Text style={strong ? s.bold : {}}>{value}</Text>
    </View>
  );
}
