# SmartTrip

Mobile-first React + Vite + Tailwind application for trip and fleet operations. The app has an explicitly labelled browser-local demo and a separate Supabase backend implementation. **It is a working core setup, not a verified production deployment of the complete reference specification.** Connect and test your Supabase project before entering real business data.

## Start locally

1. Install Node.js 22.12 or newer.
2. Open a terminal in the `smarttrip` directory.
3. Run `npm ci` to install the locked dependencies.
4. Run `npm run dev`, then open the local address printed in the terminal.
5. Click **Open demo workspace** to try fictional records. Demo changes are saved in this browser's local storage. They do not sync between devices or go to Supabase. Settings includes a demo reset action.

Other commands: `npm test` runs calculations and local PostgreSQL checks; `npm run build` makes the production files in `dist`; `npm run preview` serves that build locally. If Windows blocks test subprocesses, use `node --test --test-isolation=none tests/calculations.test.js tests/database.test.js`.

## Connect Supabase later

1. Create a new Supabase project. In its SQL editor run the complete `supabase/migrations/001_core.sql` file once. It creates the schema, RLS policies, financial validation triggers, audit log and private `documents` bucket in a transaction.
2. Copy `.env.example` to `.env`. Set `VITE_SUPABASE_URL` to the project URL and `VITE_SUPABASE_ANON_KEY` to its **publishable key or legacy anon key**. Never use a service-role key, secret key or database password in a VITE variable. `.env` is ignored by Git.
3. In Supabase Auth, enable email/password authentication and configure the Site URL and permitted redirect URL for your chosen domain. Configure confirmation email delivery. Restart the development server or rebuild after changing environment variables.
4. Open SmartTrip, create an account, confirm the email and sign in. Create your business when prompted. The database creates the first account as the business admin. A real workspace starts empty: no demo records are copied into it.
5. For office staff, create their account through Supabase Auth, then have a trusted database administrator insert a `profiles` row containing their Auth user UUID, your organization UUID and role `staff`. Do not expose privileged keys in a browser to do this. Membership administration is not yet an in-app feature.
6. Complete the live acceptance checklist below before production use.

### Data model and access

Organizations own clients, vehicles, drivers, bookings, trips, expenses, fuel logs, maintenance, invoices, payments, documents and settings. Profiles link users to organizations. Composite foreign keys prevent cross-business links. Places and invoice lines are validated JSON arrays inside their parent row, saved atomically. Material changes create audit records with the actor and old/new values. Important records are archived instead of deleted.

Admin and staff can operate the core workflow. Only admins can edit settings and read audit logs. Driver/client profile roles are **denied business access in this release**; their dedicated limited portals are not implemented. Do not assign these roles expecting a usable portal. No user can promote themselves through a frontend profile update.

Payment records are append-only. Corrections use a refund and a new payment. Issued invoices are immutable except for cancellation with zero net payments. A cancelled invoice cannot be reissued. One active invoice per trip is supported. Database sequences generate unique voucher/invoice numbers; gaps are normal and numbering is not claimed to meet any regulatory standard. Form submission keys prevent an uncertain network retry from creating a duplicate record. If you see a duplicate-key error after a failed save, refresh and verify the saved record before starting a new form.

## Core workflow

1. Add a client, vehicle and driver.
2. Create a booking and use **Create trip**, or open **New trip**.
3. Work through client, assignment, route, readings, pricing and review. Save a draft at any time. Choose full start/end dates for overnight trips. A completed trip requires valid readings and actual timestamps.
4. Add trip-linked expenses in Expenses. Fuel logs are informational; enter fuel costs once in Expenses for reports. Maintenance has its own cost records and is included in operating costs: do not also record that same cost as an expense.
5. Open the trip, go to invoicing and click **Create invoice**. Per-km and per-hour rates prefill the actual quantity. Package/day and custom amounts require manual quantity review. Add any extra charges as invoice lines. Tax defaults to zero; apply it only when appropriate.
6. Open the invoice and record partial/full payments. Refunds are separate records. Overpayments and excessive refunds are rejected by the UI adapter and database.
7. Use **Voucher**, **View invoice** or **Receipt**, then **Print / Save PDF**. Use the browser's Save as PDF destination. Signatures are blank print/sign fields, not electronic signatures.
8. Review date-filtered reports and export the currently selected report. Directory exports are explicitly labelled **Export page** and contain only that page.

## Calculation definitions

- Currency is integer paise. Invoice line rounding and tax use integer arithmetic in JavaScript and numeric arithmetic in PostgreSQL. Discount is applied before configured tax.
- Trip km = closing odometer − opening odometer. Closing without opening, negative distance and overlapping place readings are rejected. GPS is separate and not connected.
- Invoiced revenue = issued invoice totals by invoice date; cancelled invoices are excluded. This is not collected cash.
- Collections = payments − refunds by payment date.
- Outstanding = invoice total − all payments + all refunds for that invoice, regardless of payment date.
- Operating costs = expense records + maintenance cost records by date. Fuel logs are excluded to avoid double counting. Costs of cancelled trips remain real expenses.
- Operating contribution = invoiced revenue − recorded operating costs. This is not net profit and excludes unrecorded overheads.
- Cancelled trips are excluded from trip-count and distance reports. Draft/planned trip counts may be included but distance stays blank until readings exist.

## PWA and offline behavior

The manifest, 192/512 PNG icons, standalone display and service worker are included. The service worker caches only same-origin hashed JavaScript/CSS build assets. It never caches authentication requests, Supabase data, document URLs or API responses. There is **no full offline business-data mode or background sync**. A network connection is required for live saves; an offline banner explains this. Explicit database drafts are the way to preserve work.

Install over HTTPS using a supported browser's install/Add to Home Screen menu. On iPhone, use Safari's Share menu. Browser simulation is not physical-device verification. Android/iPhone installation, software-keyboard behavior, notches, browser print-to-PDF and standalone launch still need real-device checks. No background location, push delivery or guaranteed background execution is claimed.

## Deploy

This project includes a private Sites hosting manifest. The first published preview runs in setup/demo mode, with no Supabase configuration embedded. Keep it private while verifying.

For Vercel or another static host: use `npm ci`, build command `npm run build`, and output directory `dist`. Set the two public Supabase environment variables in the host's build environment. `vercel.json` supplies SPA fallback routes. Use HTTPS. Rebuild for configuration changes, and configure the resulting domain in Supabase Auth. A local `.env` file is intentionally not included in source publishing.

## Backups and privacy

Enable appropriate managed database backups for your Supabase plan and test restoration into a separate project. Back up private Storage objects separately; database backups alone do not restore file contents. CSV reports are operational exports, not a complete relational backup. Store backup credentials outside this repository. Use a retention policy for uploaded documents and audit records appropriate to your business. Do not collect GPS or signature data until consent and retention features exist.

## Tested and remaining gates

See `TEST_REPORT.md` for precise results. The migration was run in a local PostgreSQL-compatible PGlite environment with simulated Supabase auth/storage schemas, including RLS and adversarial tenant tests. This does **not** verify Supabase Auth email delivery, Storage APIs, network concurrency, refresh-token flows or deployed access controls.

Before production: test two real businesses and a staff account; verify no cross-tenant reads/writes through direct API calls; exercise concurrent invoice/payment submissions; sign out and back in after each saved workflow; upload a private file and test signed URL expiration; verify network failure and recovery; install on Android/iPhone and print a multipage voucher. Use a separate test project for these checks.

## Known limitations / planned features

- Live Supabase integration is implemented but unconnected at the owner's request. No production-readiness claim.
- Driver/client portals, in-app invitations/custom permissions, arbitrary currencies/timezones, custom expense categories, configurable rate-plan tables and document-retention automation remain planned.
- Reports have a 2,000-row per-category cap and fail clearly when exceeded; narrow the date range. Specialized vehicle utilisation, trip contribution, client/driver breakdowns and richer filters remain planned. Reminders check the most recent 100 records per relevant category and say so in the UI.
- Same-day scheduling warnings do not reserve vehicles or guarantee availability. Calendar scheduling and overnight overlap detection remain planned.
- Search on the live trip list is voucher-number search; related client/driver/route search and advanced sort/filter controls remain planned.
- The voucher contains core identity, route, odometer, time and place information. Advanced paper-voucher fidelity, embedded charge breakdowns and digital signatures remain planned.
- No direct PDF-file generation or automated sharing: use browser printing. Multipage print output remains a manual acceptance gate.
- No OCR, AI, voice, GPS, WhatsApp, email/SMS or payment gateway is connected. Their status is shown as not configured; there are no fabricated results. Add these only after the real core workflow passes acceptance, through server-side integrations with review/confirmation.
- Live unsaved forms are kept only in memory until saved; reload/close warnings do not replace saving a draft. No silent financial offline queue.

## Troubleshooting

**Setup screen only:** check both VITE variables, restart/rebuild, and leave demo mode to sign in.

**Permission denied / row policy error:** check that the migration completed, the user has a profile, and all linked records belong to the same business. Never disable RLS to get past this error.

**No records:** real businesses start empty. Demo records are isolated; report dates and pagination may also hide records.

**Payment rejected:** check the selected invoice, net payments/refunds and duplicate reference. An invoice is not a payment receipt.

**Report range too large:** narrow the dates. Do not assume a truncated export is complete.

**Install option absent:** use HTTPS or localhost and a supported browser. Some embedded browsers do not expose installation controls. Try the device's full browser.
