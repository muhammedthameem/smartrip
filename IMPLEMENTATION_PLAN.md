# SmartTrip implementation

The pasted mobile requirements take precedence over the reference specification. Source reference files remain untouched.

- [x] Inspect empty workspace and choose React/Vite/Tailwind architecture.
- [x] Foundation: mobile navigation, lazy routes, reusable forms and states.
- [x] Data implementation: Supabase migration, tenant authorization, authenticated repository and isolated demo adapter.
- [x] Core implementation: masters, booking conversion, trip wizard, odometer validation, expenses, invoices, payments, print and reporting.
- [x] Operations implementation: maintenance, fuel logs, same-day conflict warnings, expiry reminders and manual document management.
- [x] Local PostgreSQL and calculation tests; production build.
- [x] Initial responsive checks across all eight widths; demo trip-to-payment workflow.
- [x] Document connection, deployment and remaining verification gates.
- [ ] Final browser recheck after invoice preview and balance changes (browser automation blocked on an internal error page).
- [ ] Live Supabase Auth, Storage, persistence after re-login, concurrency and deployed RLS acceptance tests.
- [ ] Physical Android/iPhone installation, keyboard/notch behavior and multipage print acceptance.
- [ ] Remaining extended reference features documented in README; optional integrations follow the live core gate.

## Architecture
`src/components` shared UI; `src/pages` lazy route screens; `src/lib` calculations, repository, session and demo data; `supabase/migrations` schema and policies; `tests` calculation and security regression checks; `public` install manifest and static-only service worker.

## Connection boundary
User will connect Supabase later. Real authentication, RLS, storage and persistence must not be reported as verified until run against that project. Demo mode is opt-in and uses only labelled sample records. No optional OCR/AI/GPS provider is configured. Do not progress into live integrations before core acceptance.
