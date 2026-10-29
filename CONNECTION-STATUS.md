# KYN connection status — October 28, 2026

## Connected and deployed

- GitHub source: https://github.com/Prathsha/KYN (public repository created by the owner). All 70 source files are committed; private environment files are excluded.
- GitHub repository connected to the existing Vercel project for automatic deployments.
- Live production website: https://kyn-omega.vercel.app
- Alternate production alias: https://kyn-prathshah.vercel.app
- Vercel project: `kyn` (`prj_wo6yxrtIFlCbbeGUv77SWleHQo8F`)
- Deployment: `dpl_844RuKHMrfDGq6XCdHRZxUj5oXwp`, READY
- Supabase project: `KYN` (`fkmlkpieayqumqvxfzhv`), US East
- Supabase dashboard: https://supabase.com/dashboard/project/fkmlkpieayqumqvxfzhv
- Initial database migration applied successfully. All eight public tables have RLS enabled.
- Vercel production, preview and development variables configured with the public project URL and publishable key. No privileged key is in the app.
- Local `.env.local` and native `mobile/.env` configured. Native API URL points to the live production site. These local environment files are excluded from Git and source archives.
- Production is publicly accessible; Vercel preview deployments retain login protection.

## Verified live

- Homepage, interactive demo and PWA manifest return HTTP 200.
- Journey API returns HTTP 401 for an unsigned-in request.
- Supabase Auth settings endpoint responds; email signup is enabled.
- Anonymous REST reads of bookings and meeting PINs are denied.
- All eight database tables have RLS enabled, and eight public meeting points are installed.
- Website shows the real sign-in form, rather than backend-not-configured guidance.
- Live PostgreSQL transaction test passed role switching, companion-only acceptance, PIN isolation, NULL-PIN rejection, messaging and dual completion. All temporary users/journeys/messages were rolled back.
- Web production build and iOS/Android exports pass with live connection settings.

## Remaining connection steps

1. **Email delivery validation:** Site URL is now `https://kyn-omega.vercel.app`; all four production/local redirect URLs are saved and verified in the dashboard. Verify receipt of signup/reset emails using your own account. Configure custom SMTP before inviting general pilot users; default provider mail is restricted.
2. **Pilot accounts:** the confirmed owner account has been assigned the operator role. Refresh My journeys to access pilot pause/resume controls. Create a separate companion test account and approve it using the README procedure. Companion approval currently uses the database administration step; it is not a web operator screen. The pilot remains paused. No companions or successful bookings have been fabricated.
3. **Stripe:** New business is connected to this session in live and test mode. Test mode is selected for integration work. The deployed app still needs its own restricted test API key, checkout endpoints and verified payment webhooks. The site currently collects no payments.
4. **Native distribution:** the app uses the live API, but needs Expo project ownership, bundle/package identifiers, signing credentials, device testing and Apple/Google developer accounts before signed distribution. Bundles are not installable store binaries.
5. **Other integrations:** live navigation, push notifications and screening/operations integrations are not configured.

## Database advisor review

The advisor reports ten authenticated SECURITY DEFINER RPC warnings. These are deliberately restricted mutation and RLS-lookup functions: anonymous execution is revoked, mutation functions verify auth.uid(), authorization and journey state, and client table writes are revoked. This is an intentional security boundary, not an assertion that no warnings exist. Keep auditing these functions as features change. Local PostgreSQL tests cover role escalation, participant isolation, PINs and transitions; live transaction checks also pass. Email delivery and signed-in HTTP/device flows still need account-based verification.

Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## October 29 payment integration update

Added Stripe SDK 23, test-only checkout endpoint, signed webhook handler, completed-journey test checkout UI and an isolated payment table. Migration `test_journey_payments` applied and live permission checks passed. Registered test webhook `we_1UW12YEvWnR2lOfAFXFG65KO`; signing secret saved in Vercel production. Existing restricted Stripe key remains stored in Vercel. Pending SUPABASE_SECRET_KEY and explicit feature enablement, followed by hosted checkout verification. Pilot remains paused.

Security advisor: the payment migration added no new advisor findings. The ten existing authenticated SECURITY DEFINER warnings remain, and leaked-password protection is disabled (https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
