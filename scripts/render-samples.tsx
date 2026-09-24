/**
 * Renders sample PDFs (no database needed) into ./samples for visual checks:
 *   npm run pdf:samples
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { calculateDocument } from "@/lib/calc/document";
import type { DocumentLineRow, DocumentRow } from "@/lib/db/schema";
import type { ClientSnapshot, SellerSnapshot } from "@/lib/documents/types";
import { buildPdfData } from "@/lib/pdf/build";
import { DocumentPdf, registerFonts } from "@/lib/pdf/document-pdf";
import { taxSplit } from "@/lib/tax/gst";

const seller: SellerSnapshot = {
  legalName: "Fenlark Technologies Private Limited",
  tradeName: "Fenlark",
  addressLine1: "No. 12, 5th Cross, HAL 2nd Stage",
  addressLine2: "Indiranagar",
  city: "Bengaluru",
  postalCode: "560038",
  stateCode: "29",
  country: "IN",
  email: "billing@fenlark.in",
  phone: "+91 80 4000 1234",
  website: "fenlark.in",
  gstRegistration: "regular",
  gstin: "29AAGCF1234K1ZV",
  pan: "AAGCF1234K",
  udyamNumber: "UDYAM-KR-03-0012345",
  lutArn: "AD290426000123X",
  signatoryName: "Priya Sharma",
  brandColor: "#0f766e",
  logoPath: null,
  signaturePath: null,
  bankAccountName: "Fenlark Technologies Pvt Ltd",
  bankName: "HDFC Bank",
  bankAccountNumber: "50200012345678",
  bankIfsc: "HDFC0001234",
  bankBranch: "Indiranagar",
  bankSwift: "HDFCINBB",
  upiId: "fenlark@okhdfcbank",
  upiPayeeName: "Fenlark Technologies",
};

const indianClient: ClientSnapshot = {
  name: "Acme Retail Private Limited",
  contactName: "Rahul Mehta",
  email: "accounts@acme.test",
  phone: "",
  gstin: "29AABCA1111B1Z2",
  pan: "AABCA1111B",
  isSez: false,
  addressLine1: "4th Floor, Prestige Tower",
  addressLine2: "Residency Road",
  city: "Bengaluru",
  postalCode: "560025",
  stateCode: "29",
  country: "IN",
  shippingAddress: "",
};

const usClient: ClientSnapshot = {
  ...indianClient,
  name: "Globex Corporation",
  contactName: "Dana Scully",
  gstin: "",
  pan: "",
  addressLine1: "500 Market Street",
  addressLine2: "Suite 900",
  city: "San Francisco, CA",
  postalCode: "94105",
  stateCode: "",
  country: "US",
};

type LineSpec = { name: string; description?: string; hsnSac: string; quantity: string; unit?: string; rate: string; discount?: string; gstRate: string };

function build(
  base: Partial<DocumentRow> & Pick<DocumentRow, "type" | "supplyType" | "currency">,
  specs: LineSpec[],
): { doc: DocumentRow; lines: DocumentLineRow[] } {
  const split = taxSplit(true, base.supplyType, base.exportTax ?? null);
  const inputs = specs.map((l) => ({
    quantity: l.quantity,
    rate: l.rate,
    discountType: "percent" as const,
    discountValue: l.discount ?? "0",
    gstRate: l.gstRate,
    hsnSac: l.hsnSac,
    unit: l.unit ?? "OTH",
  }));
  const calc = calculateDocument({ lines: inputs, split, roundOff: base.currency === "INR", reverseCharge: false });
  const lines = specs.map((l, i) => ({
    id: String(i),
    documentId: "x",
    position: i,
    itemId: null,
    name: l.name,
    description: l.description ?? "",
    hsnSac: l.hsnSac,
    quantity: l.quantity,
    unit: l.unit ?? "OTH",
    rate: l.rate,
    discountType: "percent" as const,
    discountValue: l.discount ?? "0",
    gstRate: l.gstRate,
    gross: calc.lines[i].gross,
    discount: calc.lines[i].discount,
    taxable: calc.lines[i].taxable,
    cgst: calc.lines[i].cgst,
    sgst: calc.lines[i].sgst,
    igst: calc.lines[i].igst,
    total: calc.lines[i].total,
  }));
  const doc = {
    id: "x",
    status: "issued",
    number: "FL/26-27/0042",
    fy: "26-27",
    issueDate: "2026-09-24",
    dueDate: "2026-10-09",
    validUntil: null,
    clientId: "c",
    clientSnapshot: null,
    sellerSnapshot: null,
    exchangeRate: "1",
    placeOfSupply: "29",
    exportTax: null,
    reverseCharge: false,
    reference: "PO-7781",
    subject: "",
    notes: "Thank you for your business.",
    terms: "Payment due within 15 days. Interest at 18% p.a. on overdue amounts. Subject to Bengaluru jurisdiction.",
    ...calc,
    amountPaid: "0",
    tdsAmount: "0",
    creditedTotal: "0",
    debitedTotal: "0",
    balanceDue: calc.total,
    relatedDocumentId: null,
    noteReason: null,
    recurringProfileId: null,
    publicToken: null,
    sentAt: null,
    viewedAt: null,
    issuedAt: null,
    respondedAt: null,
    voidedAt: null,
    voidReason: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...base,
  } as unknown as DocumentRow;
  doc.balanceDue = (Number(doc.total) - Number(doc.amountPaid) - Number(doc.tdsAmount)).toFixed(2);
  return { doc, lines };
}

async function main() {
  registerFonts();
  const out = path.join(process.cwd(), "samples");
  await mkdir(out, { recursive: true });

  const services: LineSpec[] = [
    { name: "Website redesign", description: "Discovery, UX, visual design and front-end build for fenlark.in", hsnSac: "998314", quantity: "1", rate: "85000", gstRate: "18" },
    { name: "Hosting & maintenance", description: "Oct 2026 – Mar 2027", hsnSac: "998315", quantity: "6", unit: "OTH", rate: "4500", discount: "10", gstRate: "18" },
    { name: "Printed brochures", hsnSac: "4911", quantity: "500", unit: "NOS", rate: "12.5", gstRate: "12" },
  ];

  const samples: Record<string, ReturnType<typeof build>> = {
    "invoice-intra-state": build({ type: "invoice", supplyType: "intra", currency: "INR", amountPaid: "20000", tdsAmount: "8500" }, services),
    "invoice-inter-state": build({ type: "invoice", supplyType: "inter", currency: "INR", placeOfSupply: "27" }, services.slice(0, 2)),
    "invoice-export-lut": build(
      { type: "invoice", supplyType: "export", currency: "USD", exportTax: "lut", placeOfSupply: "96", exchangeRate: "83.2500", number: "FL/26-27/0043" },
      [{ name: "Mobile app development", description: "Sprint 14–16", hsnSac: "998314", quantity: "120", unit: "OTH", rate: "45", gstRate: "18" }],
    ),
    "quote": build({ type: "quote", supplyType: "intra", currency: "INR", number: "FLQ/26-27/0007", validUntil: "2026-10-24", dueDate: null }, services.slice(0, 1)),
    "credit-note": build(
      { type: "credit_note", supplyType: "intra", currency: "INR", number: "FLCN/26-27/0001", noteReason: "post_sale_discount", relatedDocumentId: "r", dueDate: null },
      [{ name: "Discount on website redesign", hsnSac: "998314", quantity: "1", rate: "5000", gstRate: "18" }],
    ),
    "draft": build({ type: "invoice", supplyType: "intra", currency: "INR", status: "draft", number: null }, services.slice(0, 1)),
  };

  for (const [name, { doc, lines }] of Object.entries(samples)) {
    const client = doc.currency === "USD" ? usClient : indianClient;
    const data = await buildPdfData({
      doc,
      lines,
      seller,
      client,
      related: doc.relatedDocumentId ? { number: "FL/26-27/0042", issueDate: "2026-09-24" } : null,
      logo: null,
      signature: null,
    });
    const buffer = await renderToBuffer(<DocumentPdf data={data} />);
    await writeFile(path.join(out, `${name}.pdf`), buffer);
    console.log(`✓ samples/${name}.pdf`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
