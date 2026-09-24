/**
 * Seed defaults (settings row, numbering series), optionally the owner account
 * and demo data.
 *
 *   npm run db:seed                         # defaults only
 *   npm run db:seed -- --owner you@fenlark.in
 *   npm run db:seed -- --demo               # sample clients, items and documents (dev only)
 */
import "./load-env";
import { count, eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { businessSettings, clients, items, users } from "@/lib/db/schema";
import { SYSTEM_ACTOR } from "@/lib/activity";
import { addDays, todayIST } from "@/lib/dates";
import { issueDocument, saveDraft } from "@/lib/documents/service";
import { recordPayment } from "@/lib/payments/service";
import { gstinCheckDigit } from "@/lib/tax/gst";
import { loadNumberSeries, loadSettings } from "@/lib/settings";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "";
}

function gstin(state: string, pan: string): string {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
}

async function main() {
  await loadSettings();
  await loadNumberSeries();
  console.log("✓ Settings and numbering series ready");

  const owner = arg("owner") ?? process.env.OWNER_EMAIL ?? null;
  if (owner) {
    const email = owner.trim().toLowerCase();
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      await db.update(users).set({ role: "owner", active: true }).where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({ email, role: "owner" });
    }
    console.log(`✓ Owner account: ${email} (sign in with an emailed code)`);
  }

  if (arg("demo") !== null) {
    if (process.env.NODE_ENV === "production") throw new Error("Refusing to load demo data in production");
    const [{ n }] = await db.select({ n: count() }).from(clients);
    if (n > 0) {
      console.log("• Clients already exist — skipping demo data");
    } else {
      await seedDemo();
      console.log("✓ Demo data loaded");
    }
  }
}

async function seedDemo() {
  const settings = await loadSettings();
  if (!settings.legalName) {
    await db
      .update(businessSettings)
      .set({
        legalName: "Fenlark Technologies Private Limited",
        tradeName: "Fenlark",
        addressLine1: "No. 12, 5th Cross, HAL 2nd Stage, Indiranagar",
        city: "Bengaluru",
        postalCode: "560038",
        stateCode: "29",
        email: "billing@fenlark.in",
        website: "fenlark.in",
        gstin: gstin("29", "AAGCF1234K"),
        pan: "AAGCF1234K",
        lutArn: "AD290426000123X",
        bankAccountName: "Fenlark Technologies Pvt Ltd",
        bankName: "HDFC Bank",
        bankAccountNumber: "50200012345678",
        bankIfsc: "HDFC0001234",
        upiId: "fenlark@okhdfcbank",
        upiPayeeName: "Fenlark Technologies",
        signatoryName: "Authorised Signatory",
        invoiceTerms: "Payment due within the credit period. Interest at 18% p.a. on overdue amounts. Subject to Bengaluru jurisdiction.",
      })
      .where(eq(businessSettings.id, 1));
  }

  const [acme, nova, globex] = await db
    .insert(clients)
    .values([
      { name: "Acme Retail Private Limited", contactName: "Rahul Mehta", email: "rahul@acme.example", gstin: gstin("29", "AABCA1111B"), pan: "AABCA1111B", stateCode: "29", city: "Bengaluru", addressLine1: "4th Floor, Prestige Tower", tdsApplicable: true, tdsRate: "10", tdsSection: "194J" },
      { name: "Nova Foods LLP", contactName: "Anita Desai", email: "accounts@nova.example", gstin: gstin("27", "AAKFN2222C"), stateCode: "27", city: "Mumbai", addressLine1: "12 Marine Drive" },
      { name: "Globex Corporation", contactName: "Dana Scully", email: "ap@globex.example", country: "US", currency: "USD", city: "San Francisco, CA", addressLine1: "500 Market Street", postalCode: "94105" },
    ])
    .returning();
  await db.insert(items).values([
    { name: "Website design & development", hsnSac: "998314", rate: "75000", gstRate: "18", description: "Design and build of a marketing website" },
    { name: "Monthly maintenance retainer", hsnSac: "998315", rate: "15000", gstRate: "18" },
    { name: "UI/UX consulting (per hour)", hsnSac: "998311", rate: "3500", gstRate: "18", unit: "OTH" },
  ]);

  const today = todayIST();
  const line = (name: string, hsnSac: string, rate: string, quantity = "1") => ({
    itemId: null,
    name,
    description: "",
    hsnSac,
    quantity,
    unit: "OTH",
    rate,
    discountType: "percent" as const,
    discountValue: "0",
    gstRate: "18",
  });
  const base = { dueDate: null, validUntil: null, exchangeRate: "1", currency: "INR", exportTax: null, reverseCharge: false, reference: "", subject: "", notes: "Thank you for your business.", terms: "", relatedDocumentId: null, noteReason: null };

  const a = await saveDraft(SYSTEM_ACTOR, null, { ...base, type: "invoice", clientId: acme.id, issueDate: addDays(today, -40), placeOfSupply: "29", lines: [line("Website design & development", "998314", "75000")] });
  const inv1 = await issueDocument(SYSTEM_ACTOR, a);
  await recordPayment(SYSTEM_ACTOR, { documentId: inv1.id, kind: "payment", date: addDays(today, -20), amount: "81000", tdsAmount: "7500", tdsSection: "194J", method: "bank_transfer", reference: "UTR0001", notes: "" });

  const b = await saveDraft(SYSTEM_ACTOR, null, { ...base, type: "invoice", clientId: nova.id, issueDate: addDays(today, -25), dueDate: addDays(today, -10), placeOfSupply: "27", lines: [line("UI/UX consulting (per hour)", "998311", "3500", "12")] });
  await issueDocument(SYSTEM_ACTOR, b);

  const c = await saveDraft(SYSTEM_ACTOR, null, { ...base, type: "invoice", clientId: globex.id, issueDate: addDays(today, -5), currency: "USD", exchangeRate: "83.25", placeOfSupply: "96", lines: [line("Mobile app sprint", "998314", "4800")] });
  await issueDocument(SYSTEM_ACTOR, c);

  const q = await saveDraft(SYSTEM_ACTOR, null, { ...base, type: "quote", clientId: nova.id, issueDate: today, placeOfSupply: "27", notes: "", lines: [line("Monthly maintenance retainer", "998315", "15000", "6")] });
  await issueDocument(SYSTEM_ACTOR, q);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
