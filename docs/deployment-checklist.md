# Deployment Checklist

Use this for staging first. Do not use production credentials in the repository.

## Pre-Deployment

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm audit --audit-level=moderate`.
- Confirm all seeded data is fake.
- Confirm `.env.local` is not committed.

## Environment Variables

- Set Supabase URL and anon key.
- Set Supabase service role key server-side only.
- Set `CRON_SECRET`.
- Set `NEXT_PUBLIC_APP_BASE_URL` or `APP_BASE_URL`.
- Set feature flags for staging.
- Set Moneyhub sandbox variables only if testing Moneyhub.
- Set OpenAI key only if testing live AI.
- Set VAPID keys only if testing Web Push.

## Database

- Apply Supabase migrations with `supabase db push`.
- Check migration status with the Supabase CLI or dashboard.
- Seed fake demo data only if required.
- Clear demo data before re-running sensitive tests.
- Verify RLS policies on all user-owned tables.

## Auth Redirects

- Add the staging site URL to Supabase Auth allowed redirect URLs.
- Add `/auth/callback`.
- Confirm sign-in and sign-out work.

## Provider Redirects And Webhooks

- Add the staging Moneyhub callback URL.
- Add the staging Moneyhub webhook URL.
- Confirm webhook route returns safe responses for invalid payloads.

## Scheduled Jobs

- Configure Vercel Cron from `vercel.json` or Supabase Cron HTTP calls.
- Pass `CRON_SECRET` using Authorization bearer header or `x-cron-secret`.
- Confirm invalid secrets are rejected.

## Smoke Tests

- Run `docs/staging-smoke-test.md`.
- Confirm iPhone PWA install and notification permission flow.
- Confirm service worker and offline fallback.

## Rollback

- Keep the previous Vercel deployment available.
- Revert to the previous deployment if smoke tests fail.
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
