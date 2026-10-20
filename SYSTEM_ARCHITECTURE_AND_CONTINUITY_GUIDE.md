# SmartTrip System Architecture, Comprehensive Feature Blueprint & Continuity Guide

> **Notice to All Developers & AI Agents**:  
> This document is the **Canonical Reference & Continuity Contract** for the SmartTrip codebase. Before modifying or adding any feature, you must read and adhere to the guidelines set forth here. **Under no circumstances should existing files, database schemas, validation guards, or calculation rules be overwritten or deleted.** All extensions must be additive, backward-compatible, and verified against the test suite.

---

## 1. Executive Summary & Philosophy

SmartTrip is a **mobile-first Operations Workspace** engineered for travel operators, taxi fleets, and transport businesses. It manages the complete end-to-end trip lifecycle: from booking requests to fleet scheduling, route odometer logging, expense capture, itemised invoicing, payment receipts, and financial reporting.

### Fundamental Architectural Pillars
1. **Mobile-First & Resilient**: Tailored for drivers and desk managers with high contrast, responsive touch targets, PWA offline warnings, and print-ready receipts/vouchers.
2. **Deterministic Financial Integrity**: All monetary values are strictly handled as integer paise (minor units, 1 INR = 100 paise) to prevent floating-point calculation errors.
3. **Dual Runtime Modes**:
   - **Local Browser Demo**: An isolated, zero-backend sandbox powered by `localStorage` and seed fixtures, providing full mock capabilities with no cloud dependencies.
   - **Live Supabase Multi-Tenant Backend**: Authenticated PostgreSQL database with strict Row Level Security (RLS), database-level financial validation triggers, audit logging, and private encrypted document storage.
4. **Dual Intelligence Subsystem**:
   - **On-Device (Deterministic)**: Regex keyword categorization, median-based anomaly warnings, rule-based natural language parser, and local Q&A over financial records without external API keys.
   - **Cloud AI (Edge Function)**: Supabase Edge Function (`smarttrip-ai`) integrating OpenAI Structured Outputs for receipt vision extraction, advanced natural language voice drafts, and report summaries, protected by a strict 30 requests/hour/user rate limiter.
5. **Non-Destructive Data Preservation**: Records are archived with `archived = true` instead of hard deleted. Invoices once issued are immutable; corrections require credit refunds and newly issued records.

---

## 2. Current Implementation Stage Matrix

| Subsystem | Current Stage | Live Verified vs Mock/Demo | Key Highlights |
|---|---|---|---|
| **PWA & Build System** | Completed | Live / Ready | Vite 7, React 19, Tailwind CSS v4, Service Worker (`sw.js`), Manifest, Auto-Update Prompt (`UpdatePrompt.jsx`). |
| **Authentication & Org Setup** | Completed | Tested via PGlite / Live Ready | Email/password, auto-first-user-is-admin, `create_business()` RPC, remembered credentials with eye toggle. |
| **Masters (Clients, Vehicles, Drivers)** | Completed | Full Parity (Demo + Supabase) | Composite keys `(org_id, id)`, unique vehicle registration per org, expiry date reminders, pagination, search. |
| **Bookings & Conversion** | Completed | Full Parity (Demo + Supabase) | Status flow (`booked`, `confirmed`, `cancelled`), atomic `convert_booking()` RPC to trip draft. |
| **Trip Wizard & Odometer** | Completed | Full Parity (Demo + Supabase) | 6-step wizard, same-day scheduling warnings, multi-place waypoint odometer validation, night halts, AC/Non-AC. |
| **Expenses & Maintenance** | Completed | Full Parity (Demo + Supabase) | Linked to trips/vehicles, 7 categories, operating cost calculation (Maintenance included; Fuel logs kept informational). |
| **Invoicing & Payments** | Completed | Full Parity (Demo + Supabase) | Integer math with rounding, immutable issued invoices, anti-overpayment triggers, refunds, auto-sequencing `INV-` / `ST-`. |
| **Print Vouchers & Receipts** | Completed | Ready for Browser Print | Print sheets for Trip Vouchers, Invoices, and Payment Receipts with Save as PDF integration. |
| **Reports & CSV Export** | Completed | Full Parity (Demo + Supabase) | Bounded date filtering (capped at 2,000 rows to prevent memory exhaustion), CSV formula injection protection (`csv()`). |
| **Document Vault** | Completed | Demo Disabled / Supabase Ready | Private bucket `documents`, tenant folder isolation, signed URLs (60s expiry), verification workflow. |
| **Smart Assistant & Insights** | Completed | Dual Mode Active | Full on-device analysis without key; Edge Function ready for OpenAI vision & voice transcription. |
| **Automated Test Suite** | 27 / 27 Passing | Node Native Test Runner | Covers calculations, PGlite PostgreSQL migration & RLS, adversarial tenant attacks, and AI security limits. |

---

## 3. Directory & File Catalog

```
smarttrip/
├── package.json                   # Dependencies (React 19, Vite 7, Tailwind 4, Lucide, PGlite)
├── vite.config.js                 # Vite config with build hash generation & version.json emitter
├── vercel.json                    # Static SPA rewrite configuration for Vercel / Netlify
├── index.html                     # HTML root with PWA meta tags and Google Fonts Outfit
├── public/
│   ├── manifest.webmanifest       # PWA manifest
│   ├── sw.js                      # Static asset caching service worker (never caches Supabase/Auth)
│   ├── version.json               # Auto-updated commit SHA & timestamp for update prompts
│   └── icon-192.png, icon-512.png # Application icons
├── src/
│   ├── main.jsx                   # Entry point, Error Boundary, route definitions & auth role gate
│   ├── styles.css                 # Master design system (responsive CSS, modern components, themes)
│   ├── lib/
│   │   ├── context.jsx            # React Context (Auth state, demo toggle, toast notifications, useList)
│   │   ├── repository.js          # Dual Data Layer (local demo adapter & Supabase client wrapper)
│   │   ├── calculations.js        # Core pure math: minor paise, distance, hours, invoice totals, CSV sanitization
│   │   ├── schema.js              # Field metadata schemas for dynamic forms (Clients, Vehicles, Drivers, etc.)
│   │   ├── validation.js          # Frontend domain invariant validation before saving to API
│   │   ├── intelligence.js        # Pure on-device deterministic intelligence (regex, medians, local Q&A)
│   │   ├── ai.js                  # Supabase Edge Function caller for `smarttrip-ai`
│   │   └── demo.js                # Seed fixture generator for browser-local demo mode
│   ├── components/
│   │   ├── Layout.jsx             # Responsive app shell: desktop sidebar, mobile bottom nav & header
│   │   ├── ui.jsx                 # Core UI atoms: Button, Badge, PageHeader, Empty, Loading, Modal, Lookup
│   │   ├── PrintDocument.jsx      # Printable templates for Vouchers, Invoices, and Payment Receipts
│   │   ├── ScheduleNotice.jsx     # Same-day vehicle & driver assignment conflict checker
│   │   ├── UpdatePrompt.jsx       # Non-intrusive auto-update prompt on new git push/build
│   │   └── InstallPrompt.jsx      # Mobile PWA installation prompt & instructions
│   └── pages/
│       ├── Dashboard.jsx          # KPI statistics, active trips, cost breakdowns & quick links
│       ├── Trips.jsx              # Trip list with status filter, voucher search, and pagination
│       ├── TripForm.jsx           # 6-step trip creation & editing wizard with waypoint readings
│       ├── TripDetail.jsx         # Single trip view, waypoint route list, expenses, and billing shortcuts
│       ├── Records.jsx            # Generic CRUD table for Clients, Vehicles, Drivers, Bookings, Expenses, etc.
│       ├── Finance.jsx            # Invoicing and Payment recording, balance tracking, and status calculations
│       ├── Reports.jsx            # Bounded date-range financial reporting, contribution metrics, CSV export
│       ├── Settings.jsx           # Business details, connection diagnostics, demo reset, PWA tools
│       ├── Documents.jsx          # File upload for receipts/vouchers with manual review & signed URLs
│       ├── Intelligence.jsx       # 5-tab Smart Assistant (Document OCR, Voice, Ask, Suggestions, Insights)
│       ├── Notifications.jsx      # Rule-based expiry alerts for vehicle documents, licenses, maintenance
│       └── Login.jsx              # Multi-tenant login, signup, business creation, and password reset
├── supabase/
│   ├── migrations/
│   │   ├── 001_core.sql           # Core database schema, RLS policies, audit logs, sequences, triggers
│   │   └── 002_ai.sql             # Per-user hourly rate limiter table (`ai_usage`) and security function
│   └── functions/
│       └── smarttrip-ai/
│           ├── index.ts           # Deno Edge Function entry point
│           ├── handler.js         # Edge Function request handler (JWT auth check, OpenAI invocation)
│           └── core.js            # JSON Schema definitions for structured draft extraction
└── tests/
    ├── calculations.test.js       # Unit tests for currency math, distance, hours, CSV sanitization
    ├── database.test.js           # PGlite tests for SQL migrations, RLS isolation, immutable triggers
    ├── intelligence.test.js       # Tests for anomaly detection, regex parsing, and report queries
    └── assistant-local.test.js    # Tests for on-device voice parsing and local assistant questions
```

---

## 4. Deep Dive: Core Business Logic & Invariants

### 4.1 Currency & Financial Mathematics (`calculations.js`)
- **Unit**: Integer paise (`minor`), where ₹1.00 = 100 paise.
- **Conversion Rule**:
  ```javascript
  minor("150.50") === 15050; // Guaranteed integer math
  ```
- **Invoice Line Calculation**:
  $$\text{subtotal} = \sum \mathrm{round}\left(\frac{\text{quantity} \times \text{unit\_minor}}{100}\right)$$
- **Tax Calculation**:
  $$\text{tax} = \mathrm{round}\left(\frac{(\text{subtotal} - \text{discount}) \times \text{tax\_bps}}{10000}\right)$$
- **Payment Invariants**:
  - A payment cannot exceed the invoice balance ($\text{total} - \text{paid}$).
  - A refund cannot exceed the net amount already collected.
  - An issued invoice is **immutable** in Supabase and Demo; it cannot be modified once created. If incorrect, it must be refunded to ₹0 and cancelled.

### 4.2 Distance & Odometer Rules (`calculations.js`, `validation.js`)
- **Trip Distance**: $\text{closing\_km} - \text{opening\_km}$.
- Closing reading must be $\ge$ opening reading.
- Waypoint place readings (`places` array) must be non-overlapping, sequential, and fit entirely between the trip's opening and closing odometers.

### 4.3 Operating Cost Definitions
- **Operating Cost** = Expenses + Maintenance.
- **Fuel Logs Exclusion**: Fuel log entries are recorded for telemetry and consumption tracking (litres/kWh), but **must not** be summed into financial reports to avoid double-counting if the operator records fuel purchases in Expenses.
- **Operating Contribution** = Invoiced Revenue $-$ Recorded Operating Costs. (Explicitly labelled as contribution, not net profit).

---

## 5. Security & Multi-Tenancy Architecture (`001_core.sql`)

### 5.1 Row-Level Security (RLS)
- Every business belongs to an `organizations` row.
- Users have a `profiles` entry linking `auth.users(id)` to `org_id` with role `'admin'`, `'staff'`, `'driver'`, or `'client'`.
- All operational tables have `org_id uuid not null references public.organizations(id)`.
- RLS enforces:
  ```sql
  using (org_id = public.current_org())
  ```
  where `current_org()` reads the authenticated user's organization from their profile.

### 5.2 Database-Level Guard Triggers
1. `validate_invoice_before`: Prevents editing issued invoices, enforces client match between trip and invoice, validates line items, and calculates total atomically.
2. `payment_balance_guard`: Locks the target invoice row (`FOR UPDATE`) and blocks payments exceeding balance or refunds exceeding received cash.
3. `trip_validation`: Verifies chronological waypoint odometers and prevents changing voucher numbers.
4. `audit_change`: Automatically logs all inserts and updates to `activity_logs` with before/after JSON snapshots and actor UUID.
5. `touch_change`: Updates `updated_at = now()` and throws an exception if any attempt is made to alter `org_id`, `id`, or `created_at`.

---

## 6. Smart Assistant & Edge AI Specification

### 6.1 Mode Breakdown
1. **On-Device Mode (Zero Key / Demo Mode)**:
   - Voice entry via Web Speech API (`webkitSpeechRecognition` with `en-IN` language tag).
   - Rule-based parser (`parseEntry`) extracting amounts, dates, categories, origin/destination, and matching client/vehicle names from active records.
   - Deterministic Q&A (`answerLocally`) answering: client receivables, vehicle costs, trip contributions, category totals, and unusual costs.
   - Median-based anomaly detection: Flags expenses exceeding $3\times$ the median of at least 3 peer records in the same category.
2. **AI-Connected Mode (Supabase Edge Function + OpenAI)**:
   - Receipt and document OCR scanning (supporting JPEG, PNG, and PDF up to 5 MB).
   - Generates structured draft via OpenAI Structured Outputs (`json_schema`).
   - Rate limit: 30 requests per user per UTC clock hour enforced via database trigger `consume_ai_request()` in `002_ai.sql`.
   - **Safety Boundary**: The model is **never** granted database write permissions or general SQL execution. Every AI response produces a client-side reviewable draft that the human operator must verify before saving.

---

## 7. Golden Rules of Continuity (Strict Guidelines for Future Features)

When asked to add features, fix bugs, or expand the application, you must follow these non-negotiable rules:

### Rule 1: Never Overwrite or Replace Existing Files Wholesomely
- Always inspect the existing file first.
- Make surgical, non-destructive edits using search-and-replace tools.
- Preserve all existing imports, exports, functions, and prop interfaces.

### Rule 2: Preserve Dual-Runtime Parity
- Every change to data querying or persistence must be implemented in **both**:
  1. The **Demo adapter** inside `src/lib/repository.js` (operating on in-memory / `localStorage` data).
  2. The **Supabase backend** (SQL migrations, triggers, and RPCs).
- Never add a feature that works in Supabase but crashes in Demo mode, or vice versa.

### Rule 3: Maintain Financial & Unit Invariants
- Never introduce raw JavaScript floating-point multiplication for currency. Always use `minor()` or `BigInt` operations as defined in `calculations.js`.
- Never bypass the `request_key` deduplication mechanism on forms.

### Rule 4: Run Tests Before and After Every Change
- The test suite must remain 100% green at all times:
  ```sh
  npm test
  ```
- If a new feature introduces new calculation rules or database tables, add corresponding regression test cases in `tests/`.

### Rule 5: Non-Destructive UI Enhancements
- Do not alter existing route URLs (`/trips`, `/bookings`, `/invoices`, etc.) as users and bookmarks depend on them.
- If adding new navigation items, append them to `nav` in `src/components/Layout.jsx`.
- Retain the clean, mobile-first design language using CSS tokens in `src/styles.css`.

---

## 8. Development & Deployment Cheatsheet

### Local Development
```sh
npm install
npm run dev        # Starts Vite on http://127.0.0.1:5173
npm test           # Runs all 27 Node native tests
npm run build      # Generates production bundle in dist/
npm run preview    # Serves the production build locally
```

### Production Environment Variables (`.env`)
```ini
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
```

### Deploying Edge Functions (Supabase CLI)
```sh
supabase secrets set OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini
supabase functions deploy smarttrip-ai --project-ref YOUR_PROJECT_REF
```
