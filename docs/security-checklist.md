# Security Checklist

Use this checklist before staging and before any wider production use.

## Secrets Handling

- Store Firebase Admin, TrueLayer, OpenAI, VAPID and cron secrets only in deployment environment variables.
- Do not commit `.env.local` or real credentials.
- Expose only client-safe public keys to browser code.
- Confirm readiness pages do not show secret names or secret values unnecessarily.
- Never expose `FIREBASE_PRIVATE_KEY` or `FIREBASE_CLIENT_EMAIL` to browser code.

## Provider Token Boundary

- Keep provider token access in server-only modules.
- Do not return access tokens, refresh tokens or token references to browser routes.
- Do not log provider tokens.
- Use encrypted storage or provider-managed token vaulting before production use.

## OpenAI Data Minimisation

- Build AI context server-side only.
- Send summaries by default, not raw transaction history.
- Do not send provider payloads, tokens, full account numbers or credentials.
- Store only redacted context summaries and response summaries.
- Keep regulated advice topics educational and signposted.

## Supabase (removed)

- Supabase has been removed from the primary path. No Supabase RLS or service-role
  configuration is required. Do not set Supabase environment variables.

## Firebase Rules

- Use `BACKEND_PROVIDER=firebase` only with Firebase Auth and Firestore rules deployed.
- Keep Firestore data under `users/{userId}` and nested user-owned collections.
- Rules must restrict reads and writes to `request.auth.uid == userId`.
- Firebase Admin usage must stay server-side.
- Push subscriptions and provider metadata in Firestore remain sensitive.

## Push Subscription Sensitivity

- Treat push endpoints, `p256dh` and `auth` keys as sensitive.
- Do not show subscription internals in UI.
- Do not include detailed financial data in push payloads.
- Log only endpoint hashes and delivery status.

## Webhooks And Cron

- Verify Moneyhub webhook signatures before production use.
- Verify TrueLayer webhook signatures before production use.
- Keep webhook payload logging redacted.
- Protect scheduled routes with `CRON_SECRET`.
- Keep Netlify scheduled functions as wrappers around protected API routes.
- Rotate cron secret if exposed.

## Audit Logging

- Audit provider sync, webhook processing, AI insight creation, notification delivery and settings changes.
- Keep audit metadata useful but not sensitive.
- Avoid raw payload dumps.

## Backup And Recovery

- Confirm Firebase export/backup expectations for Firestore before relying on it for staging data.
- Test restore before private beta.
- Document rollback for migrations and deployment changes.

## Product And Compliance Notes

- This app is a private personal finance tool.
- Production Open Banking and financial data handling require provider terms, privacy, security and regulatory review.
- Do not broaden use beyond personal/staging without compliance review.
