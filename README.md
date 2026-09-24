# Fenlark Billing

GST-ready invoicing for [fenlark.in](https://fenlark.in): quotes, tax invoices, credit and debit notes, payments with TDS, UPI and online payments, reminders, a client portal and GST reports.

Built with Next.js 16, PostgreSQL (Drizzle ORM), Resend and react-pdf. Designed to run on Vercel + Supabase. To go live, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Features

**Documents**
- Tax invoices, quotations, credit notes and debit notes, from one editor with live GST totals.
- Gap-free numbering per financial year, e.g. `FL/26-27/0001`. A number is assigned only when a document is issued, and the 16-character GST limit is enforced. You can continue an existing series.
- Issued documents are locked, and the seller and client details are frozen at issue time. Corrections go through credit/debit notes or by voiding (the number stays used).
- Quotes can be accepted or declined by the client online and converted to an invoice in one click.
- Recurring invoices (weekly to yearly) that can be issued and emailed automatically. `{MONTH}` / `{YEAR}` placeholders fill in the period.
- Branded A4 PDFs: logo, signature, GST columns, HSN/SAC summary, amount in words (lakh/crore), bank details and a UPI QR code with the amount pre-filled.

**GST**
- CGST + SGST for intra-state supplies and IGST for inter-state, decided by the place of supply.
- Exports and SEZ supplies, either zero-rated under LUT (with the Rule 96A declaration) or with IGST paid.
- Reverse charge, composition scheme (Bill of Supply) and unregistered businesses.
- Foreign-currency invoices with an exchange rate. A reference rate can be fetched; INR equivalents are used for reporting.
- GSTIN checksum and PAN validation; the state is filled in from the GSTIN.

**Getting paid**
- Record payments, part-payments, TDS deducted by clients (194J etc.) and refunds. The invoice status and balance update automatically.
- Online payments through Razorpay Payment Links (INR) and Stripe Checkout (international). Credentials are stored encrypted, and signed webhooks record the payment and email a receipt.
- UPI QR and bank details on every unpaid invoice, with no gateway needed.
- Automatic email reminders before and after the due date. Each reminder is sent once per invoice, and clients can be opted out.

**Clients**
- Share links (`/p/…`) to view, download, pay or accept a document, with "viewed" tracking.
- A client portal where clients sign in with an emailed code and see all their invoices, quotes and balances.

**Reports**
- Dashboard: outstanding, overdue, collections, sales and a 12-month chart.
- GSTR-1 workbook in the GST offline-tool layout: B2B, B2CL, B2CS, EXP, CDNR, CDNUR, HSN (B2B/B2C) and the document summary.
- Sales register, payments, TDS receivable by quarter (for matching Form 26AS), receivables aging, and a full data export, all as Excel files.
- An activity log recording actions by your team, your clients, payment gateways and the daily job.

**Team**
- Passwordless sign-in with an emailed link and 6-digit code.
- Roles: owner, admin, staff, and viewer (e.g. your accountant).

### Not included
- **E-invoicing (IRN/QR from the IRP)** is mandatory once turnover exceeds ₹5 crore. It isn't integrated here.
- **E-way bills** aren't supported, and neither is **cess**.
- The GSTR-1 workbook is for review and upload through the GST offline tool, not direct filing.
- Fetched exchange rates are ECB reference rates. Check them against the RBI/CBIC rate if you need to.

## Local development

Requirements: Node.js 22 and PostgreSQL 16.

```bash
cp .env.example .env              # set DATABASE_URL; leave RESEND_API_KEY blank for now
createdb fenlark
npm install
npm run db:migrate
npm run db:seed -- --demo         # optional: sample business, clients, invoices
npm run dev
```

Open http://localhost:3000/login and sign in with the `OWNER_EMAIL` from `.env`. If you leave `OWNER_EMAIL` blank, whoever signs in first in development becomes the owner. Without `RESEND_API_KEY`, the sign-in code and every other email are printed in the terminal instead of being sent.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit and integration tests (needs Postgres, see below) |
| `npm run db:generate` | Create a migration after changing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (uses `MIGRATION_DATABASE_URL` or `DATABASE_URL`) |
| `npm run db:seed` | Default settings; `-- --owner you@x.com` creates the owner; `-- --demo` loads sample data |
| `npm run pdf:samples` | Render sample PDFs into `./samples` for a visual check |

### Tests

Integration tests run against a real database, `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/fenlark_test`). Tables are truncated between tests.

```bash
createdb fenlark_test
npm test
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the tests (against a Postgres service) and a production build.

## Project layout

```
src/
  app/                 routes: (app) staff area, login, portal, p/[token] share pages, api/
  components/          UI (ui/ primitives, documents/ editor & detail, settings/, …)
  emails/              email template (react-email)
  lib/
    calc/              pure GST totals engine (shared by editor and server)
    documents/         document service: drafts, issue/numbering, notes, quotes
    payments/          payments, TDS, refunds
    gateways/          Razorpay / Stripe adapters and webhook handling
    pdf/               react-pdf layout and rendering
    reports/           GSTR-1 builder, report queries, Excel writer
    recurring/, reminders.ts, email/, auth/, db/, tax/, validation/
scripts/               migrate, seed, render-samples
tests/                 unit/ and integration/ (Vitest)
drizzle/               SQL migrations
```

## Security

- Sessions are random tokens stored hashed in Postgres, sent as HttpOnly cookies. Sign-in codes are single-use, expire after 15 minutes, lock after 5 wrong attempts and are rate-limited.
- Server actions check the user's role on every call. The proxy only makes a quick cookie check before the real one.
- Payment-gateway secrets are encrypted with AES-256-GCM (`ENCRYPTION_KEY`) and never sent to the browser.
- Share links use unguessable 192-bit tokens. Drafts are never public. The signature image is only ever embedded in PDFs.
- Webhooks are verified (HMAC) and processed idempotently. The daily job requires `CRON_SECRET`.
