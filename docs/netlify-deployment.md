# Netlify Deployment

Netlify is the primary staging deployment path for Personal Finance HQ. Vercel remains supported as a secondary option through `vercel.json`.

Use fake/demo data only in staging. Do not commit credentials or real financial data.

## Create The Site

1. Create a new Netlify site.
2. Connect the GitHub repository.
3. Set the build command to `npm run build`.
4. Use the Netlify Next.js plugin from `netlify.toml`.
5. Confirm the functions directory is `netlify/functions`.
6. Set `APP_BASE_URL` to the final Netlify staging URL after the first deploy.

## Environment Variables

Required for basic staging:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_BASE_URL=
CRON_SECRET=
MOCK_DATA_FALLBACK_ENABLED=true
```

Optional integrations:

```bash
OPENAI_API_KEY=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_SUBJECT=mailto:admin@example.com
TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=
MONEYHUB_CLIENT_ID=
MONEYHUB_CLIENT_SECRET=
```

Feature flags:

```bash
OPEN_BANKING_ENABLED=false
AI_MONEY_COACH_ENABLED=false
WEB_PUSH_ENABLED=false
SCHEDULED_ALERTS_ENABLED=false
MONEYHUB_SANDBOX_ENABLED=false
TRUELAYER_SANDBOX_ENABLED=false
MOCK_DATA_FALLBACK_ENABLED=true
```

Provider-specific optional values:

```bash
OPEN_BANKING_PROVIDER=mock
TRUELAYER_REDIRECT_URI=https://your-netlify-site.netlify.app/api/bank-connections/callback?provider=truelayer
TRUELAYER_WEBHOOK_SECRET=
TRUELAYER_API_BASE_URL=https://api.truelayer-sandbox.com
TRUELAYER_AUTH_BASE_URL=https://auth.truelayer-sandbox.com
TRUELAYER_SCOPES=info accounts balance cards transactions offline_access
MONEYHUB_REDIRECT_URI=https://your-netlify-site.netlify.app/api/bank-connections/callback
MONEYHUB_WEBHOOK_SECRET=
MONEYHUB_API_BASE_URL=https://api.moneyhub.co.uk/v2.0
MONEYHUB_AUTH_BASE_URL=https://identity.moneyhub.co.uk
```

Keep `SUPABASE_SERVICE_ROLE_KEY`, provider client secrets, `OPENAI_API_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `CRON_SECRET` server-side only in Netlify environment variables.

## Supabase Setup

- Apply migrations with `supabase db push`.
- Add the Netlify staging URL to Supabase Auth allowed redirect URLs.
- Add `https://your-netlify-site.netlify.app/auth/callback`.
- Confirm sign-in, sign-out, and protected route redirects.
- Keep RLS enabled on all user-owned tables.

## Open Banking Redirects And Webhooks

TrueLayer:

- Redirect URL: `https://your-netlify-site.netlify.app/api/bank-connections/callback?provider=truelayer`
- Webhook URL: `https://your-netlify-site.netlify.app/api/bank-connections/webhook/truelayer`
- Set `OPEN_BANKING_PROVIDER=truelayer` only when testing TrueLayer sandbox credentials.

Moneyhub:

- Redirect URL: `https://your-netlify-site.netlify.app/api/bank-connections/callback`
- Webhook URL: `https://your-netlify-site.netlify.app/api/bank-connections/webhook/moneyhub`
- Set `OPEN_BANKING_PROVIDER=moneyhub` only when testing Moneyhub sandbox credentials.

Provider capability for American Express, Nationwide, and Revolut must be validated in sandbox or live test mode before being treated as confirmed.

## OpenAI Setup

- Set `OPENAI_API_KEY` only if testing AI Money Coach with live OpenAI calls.
- Keep `AI_MONEY_COACH_ENABLED=false` until the key and privacy checks are ready.
- Confirm deterministic fallback works when OpenAI is disabled.

## VAPID And Web Push

- Generate VAPID keys outside the repository.
- Set `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`.
- Keep `WEB_PUSH_ENABLED=false` until staging iPhone PWA testing is ready.
- Push payloads must remain privacy-safe.

## Scheduled Functions

Netlify scheduled wrappers live in:

- `netlify/functions/scheduled-notifications.ts`
- `netlify/functions/scheduled-bank-sync.ts`

They call existing protected API routes with `CRON_SECRET`:

- `/api/notifications/scheduled`
- `/api/bank-connections/scheduled-sync`

Do not duplicate scheduled business logic in Netlify functions.

## iPhone PWA Test

1. Open the Netlify staging URL in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Open from the Home Screen icon.
5. Confirm mobile navigation avoids the Home indicator.
6. Enable notifications only from Settings.
7. Send a test notification and confirm external copy is generic.

## Smoke Test

Run `docs/staging-smoke-test.md` after each staging deploy.

Also visit `/settings/system-readiness` and confirm:

- Platform shows Netlify.
- App base URL is configured.
- Supabase status is correct.
- OpenAI, Web Push, and Open Banking statuses are safely enabled or disabled.
- Scheduled job support is shown.
- No secret values are rendered.

## Rollback

- Use Netlify deploy history to restore the previous deploy.
- Roll back database changes only with a reviewed migration plan.
- Rotate secrets if a staging secret was exposed.
- Keep Vercel config available as a secondary deployment path.

## Troubleshooting

- Build fails: confirm Node version, `npm run build`, and the Netlify Next.js plugin.
- Auth redirect fails: confirm Supabase Auth URLs include the Netlify staging URL.
- Scheduled functions fail: confirm `APP_BASE_URL` and `CRON_SECRET`.
- TrueLayer callback fails: confirm `TRUELAYER_REDIRECT_URI` exactly matches the provider portal.
- Moneyhub callback fails: confirm `MONEYHUB_REDIRECT_URI` exactly matches the provider portal.
- Webhook fails: confirm provider webhook secret and endpoint URL.
- Push fails on iPhone: confirm the app is installed from Safari to the Home Screen.
