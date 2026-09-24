import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ClientSnapshot,
  DiscountType,
  DocumentStatus,
  DocumentType,
  GstRegistration,
  NoteReason,
  PaymentKind,
  PaymentMethod,
  RecurringFrequency,
  RecurringTemplate,
  SellerSnapshot,
} from "@/lib/documents/types";
import type { ExportTax, SupplyType } from "@/lib/tax/gst";
import type { UserRole } from "@/lib/auth/roles";

/**
 * Money is numeric(14,2) and comes back from the driver as a string; all
 * arithmetic goes through decimal.js (see lib/money.ts).
 */
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });
const pct = (name: string) => numeric(name, { precision: 5, scale: 2 });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const emptyTextArray = sql`'{}'::text[]`;

// ─── Users & auth ────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always lower-case. */
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    role: text("role").$type<UserRole>().notNull().default("staff"),
    active: boolean("active").notNull().default(true),
    invitedBy: uuid("invited_by"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export type LoginAudience = "staff" | "portal";

/** One-time sign-in links / codes for staff and client-portal logins. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    audience: text("audience").$type<LoginAudience>().notNull(),
    email: text("email").notNull(),
    /** sha256 of the link token. */
    tokenHash: text("token_hash").notNull(),
    /** sha256 of the 6-digit code, salted with the token id. */
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    redirectTo: text("redirect_to"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("login_tokens_token_hash_key").on(t.tokenHash),
    index("login_tokens_email_idx").on(t.email, t.createdAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie value — the raw token is never stored. */
    id: text("id").primaryKey(),
    audience: text("audience").$type<LoginAudience>().notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Portal sessions are keyed by the client's e-mail address. */
    email: text("email").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ─── Business settings ───────────────────────────────────────────────────────

export const businessSettings = pgTable(
  "business_settings",
  {
    id: integer("id").primaryKey().default(1),

    legalName: text("legal_name").notNull().default(""),
    tradeName: text("trade_name").notNull().default(""),
    addressLine1: text("address_line1").notNull().default(""),
    addressLine2: text("address_line2").notNull().default(""),
    city: text("city").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    stateCode: text("state_code").notNull().default(""),
    country: text("country").notNull().default("IN"),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    website: text("website").notNull().default(""),

    gstRegistration: text("gst_registration").$type<GstRegistration>().notNull().default("regular"),
    gstin: text("gstin").notNull().default(""),
    pan: text("pan").notNull().default(""),
    udyamNumber: text("udyam_number").notNull().default(""),
    lutArn: text("lut_arn").notNull().default(""),
    lutValidFrom: date("lut_valid_from"),
    lutValidTo: date("lut_valid_to"),

    logoPath: text("logo_path"),
    signaturePath: text("signature_path"),
    signatoryName: text("signatory_name").notNull().default(""),
    brandColor: text("brand_color").notNull().default("#0f766e"),

    bankAccountName: text("bank_account_name").notNull().default(""),
    bankName: text("bank_name").notNull().default(""),
    bankAccountNumber: text("bank_account_number").notNull().default(""),
    bankIfsc: text("bank_ifsc").notNull().default(""),
    bankBranch: text("bank_branch").notNull().default(""),
    bankSwift: text("bank_swift").notNull().default(""),
    upiId: text("upi_id").notNull().default(""),
    upiPayeeName: text("upi_payee_name").notNull().default(""),

    defaultCurrency: text("default_currency").notNull().default("INR"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(15),
    quoteValidityDays: integer("quote_validity_days").notNull().default(30),
    roundOff: boolean("round_off").notNull().default(true),
    invoiceNotes: text("invoice_notes").notNull().default("Thank you for your business."),
    invoiceTerms: text("invoice_terms").notNull().default(""),
    quoteTerms: text("quote_terms").notNull().default(""),

    remindersEnabled: boolean("reminders_enabled").notNull().default(false),
    /** Days relative to the due date: negative = before, 0 = on the day, positive = overdue. */
    reminderOffsets: integer("reminder_offsets")
      .array()
      .notNull()
      .default(sql`'{-3,0,7,14}'::integer[]`),
    sendPaymentReceipts: boolean("send_payment_receipts").notNull().default(true),
    bccEmail: text("bcc_email").notNull().default(""),

    /** Gateway used for the "Pay online" button, per currency family. */
    gatewayForInr: text("gateway_for_inr").notNull().default(""),
    gatewayForForeign: text("gateway_for_foreign").notNull().default(""),

    updatedAt: updatedAt(),
  },
  (t) => [check("business_settings_singleton", sql`${t.id} = 1`)],
);

// ─── Numbering ───────────────────────────────────────────────────────────────

export const numberSeries = pgTable("number_series", {
  docType: text("doc_type").$type<DocumentType>().primaryKey(),
  prefix: text("prefix").notNull(),
  /** Tokens: {PREFIX} {FY} {FYLONG} {YYYY} {YY} {MM} {SEQ} */
  pattern: text("pattern").notNull().default("{PREFIX}/{FY}/{SEQ}"),
  padding: integer("padding").notNull().default(4),
  resetYearly: boolean("reset_yearly").notNull().default(true),
  updatedAt: updatedAt(),
});

export const numberCounters = pgTable(
  "number_counters",
  {
    docType: text("doc_type").$type<DocumentType>().notNull(),
    /** Financial year (`26-27`) for yearly series, `all` otherwise. */
    period: text("period").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.docType, t.period] })],
);

// ─── Clients & items ─────────────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<"business" | "individual">().notNull().default("business"),
    name: text("name").notNull(),
    contactName: text("contact_name").notNull().default(""),
    /** Lower-case; also the client-portal login. */
    email: text("email").notNull().default(""),
    ccEmails: text("cc_emails").array().notNull().default(emptyTextArray),
    phone: text("phone").notNull().default(""),

    gstin: text("gstin").notNull().default(""),
    pan: text("pan").notNull().default(""),
    isSez: boolean("is_sez").notNull().default(false),

    addressLine1: text("address_line1").notNull().default(""),
    addressLine2: text("address_line2").notNull().default(""),
    city: text("city").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    stateCode: text("state_code").notNull().default(""),
    country: text("country").notNull().default("IN"),

    shippingAddress: text("shipping_address").notNull().default(""),

    currency: text("currency").notNull().default("INR"),
    paymentTermsDays: integer("payment_terms_days"),
    tdsApplicable: boolean("tds_applicable").notNull().default(false),
    tdsRate: pct("tds_rate"),
    tdsSection: text("tds_section").notNull().default(""),
    /** Deductor's TAN, to match TDS credits in Form 26AS. */
    tan: text("tan").notNull().default(""),
    remindersEnabled: boolean("reminders_enabled").notNull().default(true),
    portalEnabled: boolean("portal_enabled").notNull().default(true),
    notes: text("notes").notNull().default(""),

    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_name_idx").on(t.name), index("clients_email_idx").on(t.email)],
);

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"service" | "goods">().notNull().default("service"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  hsnSac: text("hsn_sac").notNull().default(""),
  unit: text("unit").notNull().default("OTH"),
  rate: money("rate").notNull().default("0"),
  gstRate: pct("gst_rate").notNull().default("18"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── Documents: invoices, quotes, credit notes, debit notes ─────────────────

export const recurringProfiles = pgTable(
  "recurring_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    frequency: text("frequency").$type<RecurringFrequency>().notNull(),
    startDate: date("start_date").notNull(),
    nextRunDate: date("next_run_date"),
    endDate: date("end_date"),
    maxOccurrences: integer("max_occurrences"),
    occurrences: integer("occurrences").notNull().default(0),
    status: text("status").$type<"active" | "paused" | "ended">().notNull().default("active"),
    autoIssue: boolean("auto_issue").notNull().default(true),
    autoSend: boolean("auto_send").notNull().default(false),
    paymentTermsDays: integer("payment_terms_days").notNull().default(15),
    template: jsonb("template").$type<RecurringTemplate>().notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("recurring_next_run_idx").on(t.status, t.nextRunDate)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").$type<DocumentType>().notNull(),
    status: text("status").$type<DocumentStatus>().notNull().default("draft"),

    /** Assigned when the document is issued; drafts have no number. */
    number: text("number"),
    fy: text("fy"),

    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    validUntil: date("valid_until"),

    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    /** Frozen copies taken at issue time so later profile edits don't change issued documents. */
    clientSnapshot: jsonb("client_snapshot").$type<ClientSnapshot>(),
    sellerSnapshot: jsonb("seller_snapshot").$type<SellerSnapshot>(),

    currency: text("currency").notNull().default("INR"),
    /** INR per one unit of `currency` (1 for INR). */
    exchangeRate: numeric("exchange_rate", { precision: 14, scale: 6 }).notNull().default("1"),

    placeOfSupply: text("place_of_supply"),
    supplyType: text("supply_type").$type<SupplyType>().notNull().default("intra"),
    exportTax: text("export_tax").$type<ExportTax>(),
    reverseCharge: boolean("reverse_charge").notNull().default(false),

    reference: text("reference").notNull().default(""),
    subject: text("subject").notNull().default(""),
    notes: text("notes").notNull().default(""),
    terms: text("terms").notNull().default(""),

    subtotal: money("subtotal").notNull().default("0"),
    discountTotal: money("discount_total").notNull().default("0"),
    taxableTotal: money("taxable_total").notNull().default("0"),
    cgstTotal: money("cgst_total").notNull().default("0"),
    sgstTotal: money("sgst_total").notNull().default("0"),
    igstTotal: money("igst_total").notNull().default("0"),
    taxTotal: money("tax_total").notNull().default("0"),
    roundOff: money("round_off").notNull().default("0"),
    total: money("total").notNull().default("0"),

    /** Invoices only — maintained by the payment / note services. */
    amountPaid: money("amount_paid").notNull().default("0"),
    tdsAmount: money("tds_amount").notNull().default("0"),
    creditedTotal: money("credited_total").notNull().default("0"),
    debitedTotal: money("debited_total").notNull().default("0"),
    balanceDue: money("balance_due").notNull().default("0"),

    /** Credit/debit note → invoice; invoice → quote it was converted from. */
    relatedDocumentId: uuid("related_document_id"),
    noteReason: text("note_reason").$type<NoteReason>(),
    recurringProfileId: uuid("recurring_profile_id").references(() => recurringProfiles.id, {
      onDelete: "set null",
    }),

    /** Bearer token for the public share link /p/[token]. */
    publicToken: text("public_token"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("documents_type_number_key").on(t.type, t.number),
    uniqueIndex("documents_public_token_key").on(t.publicToken),
    index("documents_type_status_idx").on(t.type, t.status),
    index("documents_client_idx").on(t.clientId),
    index("documents_issue_date_idx").on(t.issueDate),
    index("documents_related_idx").on(t.relatedDocumentId),
  ],
);

export const documentLines = pgTable(
  "document_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    hsnSac: text("hsn_sac").notNull().default(""),
    quantity: qty("quantity").notNull(),
    unit: text("unit").notNull().default("OTH"),
    rate: money("rate").notNull(),
    discountType: text("discount_type").$type<DiscountType>().notNull().default("percent"),
    discountValue: money("discount_value").notNull().default("0"),
    gstRate: pct("gst_rate").notNull().default("0"),

    gross: money("gross").notNull(),
    discount: money("discount").notNull(),
    taxable: money("taxable").notNull(),
    cgst: money("cgst").notNull().default("0"),
    sgst: money("sgst").notNull().default("0"),
    igst: money("igst").notNull().default("0"),
    total: money("total").notNull(),
  },
  (t) => [index("document_lines_document_idx").on(t.documentId, t.position)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "restrict" }),
    kind: text("kind").$type<PaymentKind>().notNull().default("payment"),
    date: date("date").notNull(),
    /** Money actually received (or refunded), in the invoice currency. */
    amount: money("amount").notNull(),
    /** Tax deducted at source by the client — settles the invoice without cash. */
    tdsAmount: money("tds_amount").notNull().default("0"),
    tdsSection: text("tds_section").notNull().default(""),
    method: text("method").$type<PaymentMethod>().notNull(),
    reference: text("reference").notNull().default(""),
    notes: text("notes").notNull().default(""),
    gateway: text("gateway"),
    gatewayPaymentId: text("gateway_payment_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_document_idx").on(t.documentId),
    index("payments_date_idx").on(t.date),
    uniqueIndex("payments_gateway_payment_key").on(t.gateway, t.gatewayPaymentId),
  ],
);

// ─── Email, reminders, activity ──────────────────────────────────────────────

export type EmailKind =
  | "document"
  | "reminder"
  | "receipt"
  | "login"
  | "portal_login"
  | "invite"
  | "test";

export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<EmailKind>().notNull(),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    to: text("to").array().notNull(),
    cc: text("cc").array().notNull().default(emptyTextArray),
    subject: text("subject").notNull(),
    status: text("status").$type<"sent" | "failed" | "skipped">().notNull(),
    providerId: text("provider_id"),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("email_log_document_idx").on(t.documentId), index("email_log_created_idx").on(t.createdAt)],
);

export const remindersSent = pgTable(
  "reminders_sent",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** Offset from due date the reminder was for, e.g. -3, 0, 7. */
    offsetDays: integer("offset_days").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.offsetDays] })],
);

export type ActorType = "user" | "client" | "system" | "gateway";

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: text("actor_type").$type<ActorType>().notNull(),
    actorId: text("actor_id"),
    actorLabel: text("actor_label").notNull().default(""),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("activity_created_idx").on(t.createdAt),
  ],
);

// ─── Payment gateways ────────────────────────────────────────────────────────

export const gatewayConfigs = pgTable("gateway_configs", {
  provider: text("provider").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  mode: text("mode").$type<"test" | "live">().notNull().default("test"),
  /** Non-secret settings (key id, publishable key). */
  publicConfig: jsonb("public_config").$type<Record<string, string>>().notNull().default({}),
  /** AES-256-GCM encrypted JSON of secrets (see lib/crypto.ts). */
  secretConfig: text("secret_config"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

export const gatewayLinks = pgTable(
  "gateway_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<"created" | "paid" | "expired" | "cancelled">().notNull().default("created"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("gateway_links_external_key").on(t.provider, t.externalId),
    index("gateway_links_document_idx").on(t.documentId),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_provider_event_key").on(t.provider, t.eventId)],
);

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Item = typeof items.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentLineRow = typeof documentLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type BusinessSettings = typeof businessSettings.$inferSelect;
export type NumberSeries = typeof numberSeries.$inferSelect;
export type RecurringProfile = typeof recurringProfiles.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
export type EmailLogEntry = typeof emailLog.$inferSelect;
export type GatewayConfigRow = typeof gatewayConfigs.$inferSelect;
