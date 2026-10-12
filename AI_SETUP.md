# SmartTrip AI setup

The five AI workflows are implemented at `/assistant`. The private static deployment does not host the AI server: deploy the included Supabase Edge Function separately. Demo mode never calls a paid AI service.

## Two modes

| Feature | On-device mode (no key, demo or live) | AI connected (Edge Function + OpenAI key) |
| --- | --- | --- |
| Scan documents | Unavailable — upload in Documents and type details | Vision/PDF extraction into a reviewable draft |
| Voice entry | Rule-based parser: amount, date, category, route, odometer readings, client and vehicle name matching | Model-generated draft; client/vehicle still matched on device |
| Ask assistant | Calculated answers for: who owes money, vehicle costs, trip contribution, spending by category, unusual costs, summary | Free-form answers over the date-filtered report |
| Suggestions | Keyword category hint, review of “Other” expenses with one-click Apply, unusual-cost flags | Model category suggestion as a draft, plus the same review |
| Business insights | Revenue, costs, contribution, category bars, vehicle split, trip contribution, unusual costs, written summary | Same calculations plus an AI explanation |

The page shows which mode is active, and each answer/draft is labelled “AI” or “On-device”. The expense form also shows a suggested category from the description.

1. Connect Supabase following README.md and apply both SQL migrations in order, including `supabase/migrations/002_ai.sql`.
2. In Supabase Dashboard → Edge Function Secrets, set `OPENAI_API_KEY` and `OPENAI_MODEL`. Choose a model available to your API project that supports Responses, vision, PDF input and Structured Outputs. Never put the OpenAI key in a VITE variable or paste it into the app.
3. From this source directory, authenticate the Supabase CLI and deploy:

   ```sh
   supabase login
   supabase functions deploy smarttrip-ai --project-ref YOUR_PROJECT_REF
   ```

4. Rebuild the frontend with your public Supabase URL/key. Sign in as an owner or staff member, leave demo mode, and open Smart assistant. Its status check reports whether the function has the required secrets; it does not verify provider quota or model access.
5. Test with non-sensitive sample receipts first. Scan a JPEG/PNG/PDF (5 MB limit), correct missing fields, select related records, tick the review checkbox, and save. Odometer extraction only fills an empty selected trip reading; existing readings must be changed in the trip editor. Trip extraction saves a draft, never an invoice or completed trip.

## Behavior and data boundaries

- Document scans send the selected file to OpenAI on request. Originals remain in the current page only; upload separately in Documents for permanent private storage.
- Voice entry uses browser speech recognition (`en-IN`) with explicit start/stop controls. The browser may use its own remote speech provider. Unsupported browsers can use keyboard dictation or typed text. The reviewed transcript goes to OpenAI when Create AI draft is chosen. Audio is not uploaded to Supabase.
- Questions and AI explanations send a date-filtered report plus up to 500 client names and 200 vehicle names. Financial values are INR paise. Answers must cite record names and disclose their period. There is no general database execution tool and no automatic AI write operation.
- Calculated vehicle costs and trip contributions, category keyword hints, and unusual-cost warnings work in demo and live mode without OpenAI. Warnings require three same-category peers and compare against their median. They are rules, not machine learning. Costs use expenses + maintenance; informational fuel logs are excluded. Trip contribution uses linked invoices and linked expenses within the selected period, not lifetime or net profit.
- Every provider call authenticates the JWT and checks an admin/staff profile. Reads use that user's RLS permissions, not a service-role key. The transactional quota allows 30 attempted AI requests per user per UTC clock hour, including failed provider calls. Configure a provider project spending budget as well.
- Responses use `store:false`; this is not a claim of zero retention by the provider. No application prompts/files are logged by the function. Do not use confidential records until your business has approved the provider's data handling.
- AI output can be wrong. Structured output ensures shape, not truth. Review all amounts, dates and odometers before saving. Existing application and database validation applies to AI-assisted saves.

## Verification

Automated tests cover input rejection, missing credentials, user-role checks, caller-scoped reads, provider failure, cost rules, and the database quota. They use mocks for the external provider. Live model accuracy, real microphone dictation, actual Supabase deployment and real-device behavior require your connected accounts and device checks.

Official references: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision), [Supabase secrets](https://supabase.com/docs/guides/functions/secrets), [Supabase deployment](https://supabase.com/docs/guides/functions/deploy).
