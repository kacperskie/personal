# Security Checklist

Use this checklist before staging and before any wider production use.

## Secrets Handling

- Store Supabase, Moneyhub, OpenAI, VAPID and cron secrets only in deployment environment variables.
- Do not commit `.env.local` or real credentials.
- Expose only client-safe public keys to browser code.
- Confirm readiness pages do not show secret names or secret values unnecessarily.

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

## Supabase RLS

- Every user-owned table must include `user_id`.
- RLS must be enabled on all user-owned tables.
- Policies must restrict select, insert, update and delete to `auth.uid() = user_id`.
- Service role usage must stay server-side.

## Push Subscription Sensitivity

- Treat push endpoints, `p256dh` and `auth` keys as sensitive.
- Do not show subscription internals in UI.
- Do not include detailed financial data in push payloads.
- Log only endpoint hashes and delivery status.

## Webhooks And Cron

- Verify Moneyhub webhook signatures before production use.
- Keep webhook payload logging redacted.
- Protect scheduled routes with `CRON_SECRET`.
- Rotate cron secret if exposed.

## Audit Logging

- Audit provider sync, webhook processing, AI insight creation, notification delivery and settings changes.
- Keep audit metadata useful but not sensitive.
- Avoid raw payload dumps.

## Backup And Recovery

- Confirm Supabase backups are enabled for staging/production.
- Test restore before private beta.
- Document rollback for migrations and deployment changes.

## Product And Compliance Notes

- This app is a private personal finance tool.
- Production Open Banking and financial data handling require provider terms, privacy, security and regulatory review.
- Do not broaden use beyond personal/staging without compliance review.
