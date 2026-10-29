# KYN

**Source:** https://github.com/Prathsha/KYN

**Live:** https://kyn-omega.vercel.app — see [CONNECTION-STATUS.md](CONNECTION-STATUS.md) for configured services and remaining setup.

A Vercel-ready Next.js website, installable PWA, and native Expo iOS/Android app for a NYC companionship pilot. The visual system uses the supplied aloe, sea salt, sage and olive palette with dark green controls.

## What you can use now

- `/`: responsive web booking, route and fare review, scheduled requests, email accounts, profiles, companion availability, assignment, meeting PIN verification, messages, cancellation, reporting, two-person completion, rating and journey summaries.
- `/demo`: a separate, self-contained simulated walkthrough. Works without backend credentials. Demo companions, chat, verification and payments are simulations stored in that browser.
- `/setup`: connection instructions when services are not configured.
- `mobile/`: native React Native screens using the same Supabase accounts, database and web API. Includes planning, sign-in/sign-up, profile/age confirmation, availability, journeys, PIN verification, messaging, cancellation/reporting, completion and rating. Operations pause controls and downloadable summaries are on the web.
- PWA: install manifest, home-screen icons and a privacy-conscious offline screen. Personal journeys and messages are not cached offline. Requests are never silently queued.

**This is a connected pilot foundation, not a launched paid service.** There is no payment processing, live routing/GPS, transit feed, background screening provider, staffed emergency response, push notifications or app-store signing configured. The map is an illustration and fares are estimates. An approved companion must actually accept a request; the connected app does not fabricate matches or replies. Review reports in the Supabase `reports` table as the project administrator. There is no report inbox or support dispatch integration yet.

## Run locally

Use Node.js 22+ and pnpm 11.25.0. Run commands from this directory (the one containing this README and package.json).

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. Without credentials, planning and `/demo` are available; account services clearly show setup guidance.

For connected accounts, copy `.env.example` to `.env.local`, fill both values from your Supabase project's API settings, and restart the server. Use the public/publishable or anon key. **Never use a service_role key in browser or mobile environment variables.**

## Connect Supabase

1. Create a new Supabase project. Run the entire `supabase/migrations/001_kyn.sql` file once in its SQL editor. It creates tables, RPCs, triggers and row-level security. Do not run it over an existing unrelated schema.
2. Enable email/password authentication. Keep email confirmation enabled; configure a mail provider for a real pilot. Set Auth Site URL to your deployed KYN URL. Add your exact deployed URL and `http://localhost:3000` to allowed redirect URLs. The web app handles email confirmation and password recovery.
3. Put your project URL and public key in `.env.local` locally and in Vercel's environment settings. Rebuild after changing public variables.
4. Register separate rider, companion and operations test accounts. Confirm their emails and save each profile with age confirmation. New accounts always start as riders, regardless of submitted metadata.
5. In the Supabase SQL editor, grant your **test accounts** their roles by email:

```sql
update public.profiles set role = 'companion', approved = true
where id = (select id from auth.users where email = 'YOUR_COMPANION_TEST_EMAIL');

update public.profiles set role = 'ops'
where id = (select id from auth.users where email = 'YOUR_OPERATIONS_TEST_EMAIL');
```

Approval is an administrator decision; this does not perform a background check. Do not approve real companions before your screening and operating process is in place.

6. Sign in as operations on the website → My journeys → Resume requests, with an audit reason. The pilot starts paused intentionally.
7. Sign in as the approved companion → My journeys → Go available (or Account in native).
8. Sign in as rider in a different browser/profile/device. Plan a journey, review and request. Companion accepts, marks arrival, enters the rider's meeting PIN, then both confirm arrival at the destination. Test chat, cancellation and reporting in separate journeys. Lists refresh about every 5–8 seconds.

The public key relies on RLS and checked database functions. Clients cannot assign themselves roles, edit fares or write trip states directly. PINs are only readable by the rider; the companion submits the in-person code for verification. Five wrong attempts trigger a ten-minute cooldown. Reports are private to the reporter and operations. There is one open journey per rider and one assigned open journey per companion.

## Deploy the website to Vercel

1. Put the contents of this `kyn` folder in a Git repository. Keep `.env.local`, `node_modules`, `.next` and native build outputs out of Git (the supplied `.gitignore` does this).
2. Import that repository into Vercel. Choose **Next.js**. If you commit the entire surrounding workspace instead, set Root Directory to `outputs/kyn`.
3. Set Node.js to a supported version 22 or newer. `vercel.json` supplies `pnpm install --frozen-lockfile` and `pnpm build`; the lockfile includes web and mobile dependencies.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the environments you use. Deploy. Without them, the site still builds, but only the local demo is functional end to end.
5. Set Supabase Auth Site URL/redirect allowlist to the resulting HTTPS URL and test email confirmation/recovery. Redeploy after environment changes.

You can also run `vercel` from this folder after installing/authenticating the Vercel CLI. The current project has been deployed to Vercel; see CONNECTION-STATUS.md.

On iPhone: open the HTTPS site in Safari → Share → Add to Home Screen. On Android: use the browser's Install app action (or the KYN install prompt when supported). PWA installation is separate from app-store distribution.

## Native iOS and Android

```bash
cp mobile/.env.example mobile/.env
# Fill in the same Supabase URL/public key and your deployed HTTPS KYN API URL.
pnpm --dir mobile start
```

Use an Expo client compatible with SDK 58, or a development build. The native API URL is the website origin, without `/api` at the end. On a physical phone, `localhost` refers to the phone; use your deployed HTTPS website. Native sessions are persisted using OS secure storage. Password recovery currently opens the website; after resetting, sign back in to the native app.

For signed binaries:

1. Choose unique `ios.bundleIdentifier` and `android.package` values in `mobile/app.json`. They are intentionally not assigned to an organization you do not own.
2. Create/sign into your Expo account and run `eas build:configure` from `mobile/` using the EAS CLI. Connect the project and retain its generated project ID.
3. Add the three `EXPO_PUBLIC_*` values to the EAS environment used by each build. Public credentials are embedded in the client; never place privileged secrets there.
4. Run `eas build --platform android --profile preview` for an internal APK, then production builds with `eas build --platform all --profile production`. iOS internal distribution requires device registration/signing; TestFlight requires your Apple developer account. Android store publishing requires your Google Play developer account.
5. Before store submission, supply your privacy policy, support URL, account deletion flow, screenshots, age/content declarations and operating terms. The source has no account deletion UI yet; do not submit until this is implemented and tested. Validate on physical iOS/Android devices and your live backend first.

`mobile/eas.json` supplies preview and production profiles. No native binaries are signed or published by this delivery. Icons should be reviewed at store-required sizes before submission.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm --dir mobile typecheck
pnpm --dir mobile export
```

Verified locally on 2026-10-28:

- Next.js production build and both TypeScript checks pass.
- Expo exports iOS and Android Hermes bundles successfully. This is a bundling check, not a signed device build or simulator test.
- Five tests pass. The database test executes the unchanged migration in PGlite/PostgreSQL with pgcrypto and a small Supabase auth fixture. It checks role escalation rejection, RLS isolation, idempotent booking creation, correct PIN handling, private messages, dual completion, rating and all 112 route/service fare combinations.
- Browser planning/review renders with the expected route and fare. Setup and demo remain separate.

PGlite verifies database logic locally; it does not replace testing Supabase Auth, email delivery, API round trips, concurrent users, native device behavior or deployment configuration against your live project. Authentication and full cross-device flows need that final connection.

## Structure

- `app/`, `components/`: web pages and API routes
- `lib/`: authenticated API helpers and Supabase clients
- `shared/domain.ts`: palette, places, quote and UI action rules shared with native
- `supabase/migrations/001_kyn.sql`: authoritative rules, isolation and persistence
- `mobile/`: native app and EAS configuration
- `public/demo/`: isolated demonstration inherited from the earlier prototype
- `tests/`: real PostgreSQL migration and shared-domain checks

Fonts are bundled locally with their open-font licenses in `public/fonts`. No external font request is required.

## Stripe test checkout — October 29, 2026

Web riders can try Stripe-hosted checkout from a completed journey once server configuration is enabled. This is test-only and does not change dispatch, companion payouts, or the pilot pause state. Database fares are authoritative; success redirects do not mark payments paid. Signed webhooks handle paid, delayed success/failure and expiry, with paid status protected against repeated or out-of-order failure events.

Apply `supabase/migrations/002_test_payments.sql` after the initial migration. Set production server secrets `STRIPE_SECRET_KEY` (restricted test key), `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SECRET_KEY`. Set `KYN_SITE_URL` to the canonical HTTPS origin and `KYN_TEST_PAYMENTS_ENABLED=true` only after all secrets are configured. Never prefix server secrets with NEXT_PUBLIC_.

Register `/api/webhooks/stripe` for checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed and checkout.session.expired using API 2026-09-30.endive. Stripe Checkout Sessions needs read/write permissions; Products and Prices need write access for inline prices. Use test card 4242 4242 4242 4242, a future expiry and any CVC. Finish a real test journey with separate rider/companion accounts before trying checkout. Verify the database status becomes paid from the webhook and a repeat checkout is rejected. Native checkout is not yet exposed.

Seven local tests and the production build pass, including signature tampering, live-key rejection, unpaid completion, database isolation and payment reservation retries. End-to-end hosted checkout remains to be verified after the server database secret is saved.
