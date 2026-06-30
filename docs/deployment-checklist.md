# Deployment Checklist

Use this for staging first. Netlify + Firebase is the primary free staging path; Vercel remains a secondary deployment option. Supabase has been removed from the primary path. Do not use production credentials in the repository.

## Pre-Deployment

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm audit --audit-level=moderate`.
- Confirm all seeded data is fake.
- Confirm `.env.local` is not committed.
- Confirm `netlify.toml` is present.
- Confirm `vercel.json` is still present for secondary deployment support.

## Environment Variables

- Set `BACKEND_PROVIDER=firebase` for the primary free path, or `mock` deliberately.
- Set `FIREBASE_BACKEND_ENABLED=true`.
- Set Firebase public web app values.
- Set Firebase Admin credentials server-side only.
- Set `CRON_SECRET`.
- Set `NEXT_PUBLIC_APP_BASE_URL` or `APP_BASE_URL`.
- Set feature flags for staging.
- Set Netlify environment variables in the Netlify UI, not in the repository.
- Set `APP_BASE_URL` to the Netlify staging URL.
- Set Moneyhub sandbox variables only if testing Moneyhub.
- Set TrueLayer sandbox variables only if testing TrueLayer.
- Set OpenAI key only if testing live AI.
- Set VAPID keys only if testing Web Push.

## Database

### Firebase Free Path

- Confirm `firebase/firestore.rules` is present.
- Deploy Firestore rules from a trusted local Firebase CLI session.
- Confirm the Firestore layout in `docs/firebase-schema.md`.
- Seed fake demo data only if required.
- Confirm users can access only `users/{auth.uid}` and nested collections.

### Supabase (removed)

- Supabase is removed from the primary path; no Supabase migration or env setup
  is required. `BACKEND_PROVIDER=supabase` degrades safely to mock.

## Auth Redirects

- Add the staging site URL to Firebase Auth authorized domains.
- Confirm Firebase email/password sign-in and sign-out work.
- Confirm mock mode shows the demo message and requires no sign-in.

## Provider Redirects And Webhooks

- Add the staging Moneyhub callback URL.
- Add the staging Moneyhub webhook URL.
- Add the staging TrueLayer callback URL.
- Add the staging TrueLayer webhook URL.
- Confirm webhook route returns safe responses for invalid payloads.

## Scheduled Jobs

- Configure Netlify scheduled functions from `netlify/functions`.
- Keep Vercel Cron from `vercel.json` available as a secondary option.
- Pass `CRON_SECRET` using Authorization bearer header or `x-cron-secret`.
- Confirm invalid secrets are rejected.

## Smoke Tests

- Run `docs/staging-smoke-test.md`.
- Confirm iPhone PWA install and notification permission flow.
- Confirm service worker and offline fallback.

## Rollback

- Keep the previous Netlify deployment available.
- Revert to the previous Netlify deployment if smoke tests fail.
- Keep the previous Vercel deployment available if using the secondary path.
- Roll back database changes only with a reviewed migration plan.
- Rotate secrets if a staging secret is exposed.

## Post-Deployment Monitoring

- Watch auth errors.
- Watch provider sync failures.
- Watch webhook failures.
- Watch AI request failures.
- Watch scheduled job failures.
- Watch notification delivery failures.
- Confirm no sensitive payloads appear in logs.
