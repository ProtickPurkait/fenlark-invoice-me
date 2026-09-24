# Going live

This guide deploys Fenlark Billing to **Vercel** (the app and daily job), **Supabase** (Postgres and file storage) and **Resend** (email), with optional **Razorpay** / **Stripe** for online payments. All of them have free tiers that are enough to start.

The examples use `billing.fenlark.in` as the app's address. Replace it with whatever you choose.

## 1. Supabase: database and storage

1. Create a project at [supabase.com](https://supabase.com) and choose the **South Asia (Mumbai)** region. For the database password, use **Generate a password** and save it somewhere safe. Keep it to letters and digits: characters like `@ # / :` break the connection strings below.
2. Click **Connect** at the top of the project, open the **Connection String** tab, and copy two URIs. Replace `[YOUR-PASSWORD]` in both.
   - **Transaction pooler** (port `6543`). This becomes `DATABASE_URL`, used by the app.
   - **Session pooler** (port `5432`). This becomes `MIGRATION_DATABASE_URL`, used to run migrations. Don't use **Direct connection**: on the free plan it only works over IPv6, which Vercel's build servers can't reach.
3. Go to **Storage → New bucket**, name it `fenlark` and leave **Public bucket** off. Logos and signatures are stored here. No bucket policies are needed.
4. Go to **Project Settings → Data API** (called **API** in older layouts) and copy the **Project URL**. This is `SUPABASE_URL`.
5. Go to **Project Settings → API Keys** and create or copy a **Secret key** (`sb_secret_…`), or use the **service_role** key under **Legacy API keys**. This is `SUPABASE_SERVICE_ROLE_KEY`. It has full access, so only ever put it in Vercel's environment variables, never in code, a browser, chat or email. If logo uploads later fail with an authorization error, switch to the legacy service_role key.
6. In **Project Settings → Data API**, turn **Enable Data API** off. Supabase otherwise publishes every table through a public web API; the app doesn't use it, because it connects to the database directly. As a second lock, the app's migrations enable row-level security on every table, so that API returns no rows even if it's switched back on.

You don't need the **publishable key** or a personal **access token** (`sbp_…`). If you've shared either, or any secret, somewhere it could be read, revoke it and create a new one.

## 2. Resend: email

1. Sign up at [resend.com](https://resend.com) and **add the domain** `fenlark.in`.
2. Add the DNS records Resend shows (SPF/MX and DKIM) at your domain's DNS provider, then click **Verify**. This usually takes a few minutes.
3. Recommended: add a DMARC record, `_dmarc.fenlark.in TXT "v=DMARC1; p=none; rua=mailto:you@fenlark.in"`.
4. Create an **API key** with sending access. This is `RESEND_API_KEY`.

Emails go out as `EMAIL_FROM` (default `Fenlark Billing <billing@fenlark.in>`), and client replies go to the email set in *Settings → Business profile*.

## 3. Generate secrets

```bash
openssl rand -base64 32   # ENCRYPTION_KEY — encrypts payment-gateway credentials. Keep a copy; don't change it later.
openssl rand -hex 32      # CRON_SECRET — protects the daily job
```

## 4. Vercel: deploy

1. At [vercel.com](https://vercel.com), choose **Add New → Project**, import the GitHub repository, and keep the framework preset **Next.js**.
2. Under **Environment Variables**, add these for the *Production* environment:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase transaction pooler URI (port 6543) |
   | `MIGRATION_DATABASE_URL` | Supabase session pooler URI (port 5432) |
   | `APP_URL` | `https://billing.fenlark.in` |
   | `OWNER_EMAIL` | your email; the first sign-in with it creates the owner account |
   | `RESEND_API_KEY` | from Resend |
   | `EMAIL_FROM` | `Fenlark Billing <billing@fenlark.in>` |
   | `SUPABASE_URL` | Supabase Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (`sb_secret_…`) or legacy service_role key |
   | `SUPABASE_STORAGE_BUCKET` | `fenlark` |
   | `ENCRYPTION_KEY` | from step 3 |
   | `CRON_SECRET` | from step 3 |

3. **Deploy.** The build runs `npm run vercel-build`, which applies database migrations and then builds the app. If a migration fails, the deploy stops and the previous version stays live.
4. Under **Settings → Domains**, add `billing.fenlark.in` and create the CNAME record Vercel shows (`cname.vercel-dns.com`) at your DNS provider. If you change `APP_URL` later, redeploy.

> Preview deployments: only set the database variables for *Production*, or give previews their own Supabase project. Otherwise, preview builds also run migrations against your live database.

Functions run in Mumbai (`bom1`, set in `vercel.json`), close to the database.

## 5. First sign-in and setup

1. Open `https://billing.fenlark.in/login`, enter your `OWNER_EMAIL`, and use the 6-digit code from the email.
2. **Settings → Business profile:** legal name exactly as on your GST registration, registered address and state, GSTIN (the PAN is filled in automatically), and your LUT ARN and validity if you export. Also upload your logo and signature.
3. **Settings → Bank & UPI:** account details and UPI ID. INR invoices then show a scan-to-pay QR code.
4. **Settings → Invoice defaults:** payment terms, notes, terms & conditions, and rounding.
5. **Settings → Numbering:** the default is `FL/26-27/0001`. If you already issued invoices this financial year, set **next number** so the series continues without a gap.
6. **Settings → Reminders & email:** send yourself a test email, and turn on automatic reminders.
7. **Settings → Team:** invite colleagues. *Viewer* is read-only access, suitable for your accountant.

## 6. Daily job (reminders and recurring invoices)

`vercel.json` schedules `/api/cron/daily` for 03:30 UTC (09:00 IST). Vercel sends `CRON_SECRET` automatically, and daily jobs are allowed on the free Hobby plan. You can check runs under **Settings → Cron Jobs** in Vercel, or trigger one manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://billing.fenlark.in/api/cron/daily
```

## 7. Online payments (optional)

Always start with test keys and switch to live keys once a test payment works. Payments recorded through a gateway show *Online (razorpay/stripe)* on the invoice.

**Razorpay**, for INR invoices:
1. Razorpay Dashboard → **Account & Settings → API keys** → generate a key. Copy the Key ID and Key secret.
2. **Webhooks → Add new webhook:** URL `https://billing.fenlark.in/api/webhooks/razorpay`, event **payment_link.paid**, and a secret of your choice.
3. In the app, go to **Settings → Payment gateways → Razorpay**, paste the key ID, key secret and webhook secret, tick **Offer Razorpay on invoices**, and save.

**Stripe**, for international invoices:
1. Stripe Dashboard → **Developers → API keys** → copy the Secret key.
2. **Developers → Webhooks → Add endpoint:** `https://billing.fenlark.in/api/webhooks/stripe`, events **checkout.session.completed** and **checkout.session.async_payment_succeeded**. Copy the signing secret (`whsec_…`).
3. In the app, go to **Settings → Payment gateways → Stripe**, paste both values, tick the box, and save.

## 8. Backups and record keeping

GST law requires keeping books for **72 months** from the due date of the annual return for the year (CGST Act, section 36).

- The Supabase Pro plan includes daily backups. On the free plan, make your own:
  `pg_dump "$MIGRATION_DATABASE_URL" --no-owner -Fc -f fenlark-$(date +%F).dump`
- **Reports → Export all data** downloads every client, document, line and payment as an Excel file. Do this monthly and keep a copy.
- PDFs are generated from the stored documents, so they can always be recreated.

## 9. Updating

Push to the `main` branch. Vercel builds it, applies any new migrations and deploys. CI (GitHub Actions) runs lint, typecheck, the tests and a build on every pull request.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Sign-in email never arrives | Check Resend → Logs. If `RESEND_API_KEY` is missing, the code is printed in Vercel → Deployments → Functions logs. |
| "prepared statement … already exists" | `DATABASE_URL` must be the port 6543 pooler URI. The app turns prepared statements off automatically for it. |
| Logo upload fails on Vercel | Vercel's file system is read-only. Set the Supabase storage variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and make sure the bucket exists. |
| Can't issue: "business profile incomplete" | Fill in the legal name, address, state and GSTIN in Settings → Business profile. |
| Can't issue an export: LUT | Add your LUT ARN (and validity dates) in Settings, or switch the invoice to "With IGST". |
| Online payment not marked paid | Check the webhook URL, the event name and the webhook secret in the gateway dashboard. Its delivery log shows the response from the app. |
