# Personal Finance HQ

Private UK-focused personal finance dashboard with an AI money coach.

The product goal is to help the user understand spending, budgets, bills, subscriptions, savings goals, cashflow, debt, and net worth. v2 makes Netlify + Firebase the primary free deployment path with mock fallback; Supabase has been removed from the primary path. Vercel remains supported as a secondary deployment option, and TrueLayer sandbox and OpenAI remain optional and disabled by default.

## Current Phase

Phase 12C: Firebase Free Mode.

Implemented locally:

- Next.js dashboard shell with sidebar navigation.
- Mobile app shell with bottom navigation, safe-area support, and touch-friendly controls.
- Dashboard, Accounts, Transactions, Budgets, Bills & Subscriptions, Goals, Manual Entries, AI Coach, Settings, and Settings / Connected Accounts pages.
- Notifications page with unread count, severity filtering, mark-read, mark-all-read, dismiss, and action links.
- iPhone PWA metadata, `manifest.webmanifest`, app icon placeholders, Apple touch icon placeholder, and service worker registration.
- Offline fallback page and service worker handlers for fetch, push placeholders, and notification clicks.
- Moneyhub provider implementation in `src/lib/bank-providers/moneyhub-provider.ts` using the official Moneyhub API client behind the provider adapter.
- TrueLayer provider implementation in `src/lib/bank-providers/truelayer-provider.ts` behind the same provider adapter interface.
- Provider config, safe errors, payload mappers, provider notifications, and sync workflow helpers under `src/lib/bank-providers`.
- OAuth/consent route handlers for start, callback, sync, and revoke.
- Moneyhub and TrueLayer sandbox readiness checkers and Settings / Connected Accounts readiness cards.
- Provider comparison UI for mock, Moneyhub, and TrueLayer capability validation.
- Event-driven Moneyhub webhook handling at `POST /api/bank-connections/webhook/moneyhub` for transaction and sync events.
- TrueLayer webhook placeholder at `POST /api/bank-connections/webhook/truelayer` with safe signature checks, event parsing, audit events, and sync job enqueueing.
- Idempotent provider webhook event tracking with duplicate webhook no-op handling.
- Lightweight sync queue abstraction with Supabase persistence when configured and in-memory mock fallback otherwise.
- Scheduled fallback sync route at `POST /api/bank-connections/scheduled-sync`, protected by `CRON_SECRET`.
- Manual refresh-all endpoint at `POST /api/bank-connections/sync-all`.
- Transaction reconciliation for pending-to-posted, provider updates, soft deletion, restoration, and reviewed user override preservation.
- Privacy-safe transaction notifications for new activity, updates, large transactions, and potential duplicate payments.
- Transaction explorer that reads synced or mock transactions with account, institution, month, category, and spending/income/transfer filters.
- Deterministic transaction enrichment helpers for merchant normalisation, category assignment, transfer detection, recurring payment detection, bills detection, subscription detection, cashflow forecasting, and anomaly detection.
- Review workflows for approving detected bills/subscriptions, dismissing recurring candidates, editing merchant/category, marking transfers, excluding transactions from spending, and marking subscriptions inactive.
- Bills & Subscriptions page with confirmed bills, confirmed subscriptions, detected items needing review, estimates, confidence, price-change warnings, and payment-account context.
- Dashboard intelligence cards for subscription total, review queue count, projected bills account balance, unusual spending warnings, and internal transfers excluded from spending.
- Supabase migration and repository functions for merchant rules, transaction enrichments, recurring payment candidates, detected bills, detected subscriptions, spending anomalies, and cashflow events.
- Server-only AI modules under `src/lib/ai` for OpenAI client access, money-coach orchestration, prompts, context building, guardrails, and redaction.
- Authenticated `POST /api/ai/money-coach` route that builds finance context server-side, calls OpenAI only when configured, stores redacted AI insight metadata, creates audit events, and returns structured responses.
- AI Coach page with mode selector, chat-style question box, suggested prompts, response cards, key numbers, assumptions, data used, loading states, and error fallback.
- Dashboard money coach summary card with deterministic fallback plus "Ask why" and "View details" links.
- Server-only Web Push infrastructure under `src/lib/notifications` for VAPID config, sensitive push subscription storage, delivery attempts, privacy-safe push payloads, and scheduled alert generation.
- Authenticated push routes at `POST /api/notifications/push/subscribe`, `POST /api/notifications/push/unsubscribe`, and `POST /api/notifications/push/test`.
- Scheduled alert route at `GET /api/notifications/scheduled`, protected by `CRON_SECRET`.
- Service worker push handling for privacy-safe notification text and safe `/notifications` deep-link fallback.
- Settings notification UX for iPhone Home Screen PWA guidance, permission status, push status, enable/disable, and test notification.
- Netlify configuration in `netlify.toml` with the Netlify Next.js plugin and scheduled function directory.
- Netlify scheduled function wrappers for scheduled notifications and scheduled bank sync.
- Vercel Cron configuration in `vercel.json` for scheduled notifications and scheduled bank sync.
- Server-only deployment readiness and environment validation modules under `src/lib/deployment`, including Netlify, Vercel, local, and unknown platform detection.
- Safe readiness page at `/settings/system-readiness`.
- Structured server logging helper under `src/lib/observability`.
- Global error and not-found pages with safe copy.
- Netlify deployment guide, staging smoke test, security checklist, and deployment checklist docs.
- Firebase Auth, Firebase Admin session cookies, Firestore repository support, Firestore security rules, and a Firebase schema guide.
- Backend selector with `BACKEND_PROVIDER=firebase|mock` (Supabase removed from the primary path).
- Setup wizard at `/setup` for translating the old Google Sheets-style tracker into structured accounts, bills, subscriptions, manual entries, goals, debts, and review preferences.
- Account-purpose default suggestions for American Express, Nationwide, and Revolut account patterns.
- Firebase browser and Admin client helpers.
- Firebase email/password sign-in page; mock mode shows a clear demo message.
- Protected app routes via the Firebase session cookie.
- Basic user profile creation on sign-in.
- SQL migration for finance tables, provider sync state, audit log, provider token placeholders, and RLS policies.
- SQL migration for notification preferences, notification rules, app notifications, and sensitive push subscription placeholders.
- SQL migration for provider transaction update metadata and repeat-sync dedupe index.
- SQL migration for provider webhook events, sync jobs, and provider transaction status fields.
- Firestore repository layer for Firebase mode, with mock fallback. (Legacy Supabase repository branches remain unused and archived.)
- Editable Accounts page for account purpose, inclusion flags, and linked savings goals.
- Editable Manual Entries page for create, update, delete, inclusion flags, status, and review dates.
- Server-only provider token boundary stub. Real tokens are not stored in this phase.
- Notification repository functions, deterministic notification generation helpers, privacy-safe copy helpers, and audit events.
- Server-only token placeholder store with expiry metadata and client-safe payload helpers.
- Unit tests for finance calculations, repository fallback, validation, migration coverage, audit helpers, token-store boundaries, PWA files, install guidance, notification rules, provider mappers, provider safe errors, unauthenticated routes, Moneyhub and TrueLayer readiness/callback handling, webhook parsing/idempotency, synced transaction UI, duplicate handling, reconciliation, sync queue, scheduled sync protection, manual refresh-all, and sync workflow.

## Product Direction

The primary data path is direct account connection through Open Banking. CSV import is not part of the main roadmap.

Manual inputs remain in scope for debts, money owed to the user, money the user owes to others, offline accounts, cash, pension estimates, ISA/investment balances, one-off future expenses, manual recurring bills, and manual recurring income.

## Target Institutions

- American Express
- Nationwide
- Revolut

Mock defaults:

- American Express behaves as a credit card account and counts as a liability when the balance is owed.
- Nationwide supports current account, bills account, savings, and credit-card-style roles.
- Revolut supports everyday current account and vault-like savings balances where represented by the provider.

## Firebase Free Mode

Netlify + Firebase is the primary free deployment path from Phase 12C.

Copy `.env.example` to `.env.local` and use:

```bash
BACKEND_PROVIDER=firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
OPEN_BANKING_PROVIDER=mock
OPEN_BANKING_ENABLED=false
AI_MONEY_COACH_ENABLED=false
WEB_PUSH_ENABLED=false
SCHEDULED_ALERTS_ENABLED=false
MOCK_DATA_FALLBACK_ENABLED=true
```

Firebase Auth uses email/password sign-in and exchanges the browser ID token for an HTTP-only Firebase session cookie through `/api/auth/firebase-session`. Firebase Admin credentials must stay server-side only.

Firestore rules live in `firebase/firestore.rules`, and the schema is documented in `docs/firebase-schema.md`. User data is stored under `users/{userId}` and nested user-owned collections.

Use `/setup` to translate the old Google Sheets-style tracker into structured finance data before enabling sandbox account connections.

## Supabase (removed from the primary path)

Supabase has been **removed from the primary path in v2**. The two supported
backends are now `BACKEND_PROVIDER=firebase` (deployed default) and
`BACKEND_PROVIDER=mock` (local/demo). Setting `BACKEND_PROVIDER=supabase` now
degrades safely to mock.

Some legacy Supabase repository branches and the `supabase/migrations/*` SQL
files remain in the tree as unused, archived references and are never selected on
the Firebase free path. They will be deleted in a later cleanup stage. Do not set
Supabase environment variables for the Firebase free deployment.

## Moneyhub Sandbox Setup

Moneyhub is the first provider implementation target. The current code is sandbox-ready but does not include real credentials and does not make production Open Banking calls.

Required placeholders:

```bash
BACKEND_PROVIDER=firebase
OPEN_BANKING_PROVIDER=mock
MONEYHUB_CLIENT_ID=
MONEYHUB_CLIENT_SECRET=
MONEYHUB_REDIRECT_URI=http://localhost:3000/api/bank-connections/callback
MONEYHUB_WEBHOOK_SECRET=
MONEYHUB_API_BASE_URL=https://api.moneyhub.co.uk/v2.0
MONEYHUB_AUTH_BASE_URL=https://identity.moneyhub.co.uk
MONEYHUB_JWKS_URL=
MONEYHUB_PRIVATE_KEY=
MONEYHUB_KEY_ID=
OPEN_BANKING_PROVIDER_PAYLOAD_DEBUG=false
PROVIDER_PAYLOAD_DEBUG_DIR=.debug/provider-payloads
CRON_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_ORG_ID=
OPENAI_PROJECT_ID=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_SUBJECT=mailto:admin@example.com
NOTIFICATION_DELIVERY_ENABLED=false
AI_SCHEDULED_REVIEWS_ENABLED=false
```

Moneyhub sandbox setup requires a Moneyhub sandbox/API client, a registered redirect URL matching `MONEYHUB_REDIRECT_URI`, any required signing key material or key reference for the client configuration, webhook configuration in the provider admin portal, and Supabase configured for persistent sync testing.

OAuth/consent flow:

- `POST /api/bank-connections/start` creates a provider-agnostic connection record, attempts Moneyhub sandbox user registration, stores temporary state/nonce metadata server-side, and returns a safe authorization URL when configured.
- `GET /api/bank-connections/callback` verifies state, handles the provider callback server-side, stores only token placeholder metadata, creates audit/notification events, and redirects back to Settings / Connected Accounts.
- `POST /api/bank-connections/[connectionId]/sync` retrieves server-side token metadata, calls the provider sync method where available, maps provider accounts and transactions, and upserts canonical records.
- `POST /api/bank-connections/sync-all` manually refreshes all active visible connections for the signed-in user.
- `POST /api/bank-connections/scheduled-sync` runs server-side scheduled fallback syncs for active, non-expired connections when the caller supplies `CRON_SECRET`.
- `POST /api/bank-connections/[connectionId]/revoke` disconnects the provider connection and revokes token placeholders.
- `POST /api/bank-connections/webhook/moneyhub` validates a webhook signature or local stub signature, parses transaction/sync events, records idempotent provider webhook events, enqueues a connection or account sync, processes the sync server-side, records provider sync/audit events, and creates one privacy-safe notification for first-seen events.

All provider routes require authentication, run server-side, return provider-safe errors, write audit events, and never expose provider tokens to the browser.

Troubleshooting:

- Provider not configured: check `OPEN_BANKING_PROVIDER=moneyhub`, Moneyhub client credentials, base URLs, and redirect URI.
- Callback failed: check the redirect URL in Moneyhub matches `/api/bank-connections/callback`, the local user is still signed in, and state has not expired.
- Sync failed: reconnect if token metadata is missing, consent expired, or the provider reports a sandbox error.
- Consent expired: use the connected accounts page to start a fresh sandbox consent flow.
- Production Open Banking and financial data handling require provider terms review, privacy/security review, and any necessary regulatory/compliance assessment before broader use.

## TrueLayer Sandbox Setup

TrueLayer is the first read-only banking data foundation. Provider-specific code remains inside `src/lib/bank-providers`, while the public app continues to use provider-agnostic routes and sync workflow helpers.

Required placeholders:

```bash
OPEN_BANKING_PROVIDER=truelayer
OPEN_BANKING_ENABLED=true
TRUELAYER_SANDBOX_ENABLED=true
TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=
TRUELAYER_REDIRECT_URI=http://localhost:3000/api/bank-connections/callback
TRUELAYER_API_BASE_URL=https://api.truelayer-sandbox.com
TRUELAYER_AUTH_BASE_URL=https://auth.truelayer-sandbox.com
TRUELAYER_WEBHOOK_SECRET=
TRUELAYER_SCOPES=info accounts balance cards transactions offline_access
TOKEN_ENCRYPTION_KEY=
```

Provider selection:

- Use `OPEN_BANKING_PROVIDER=mock` for local development with no banking API calls.
- Use `OPEN_BANKING_PROVIDER=moneyhub` to test the existing Moneyhub sandbox path.
- Use `OPEN_BANKING_ENABLED=true` and `OPEN_BANKING_PROVIDER=truelayer` to test the TrueLayer sandbox adapter path.

Settings / Connected Accounts shows readiness and provider comparison for mock, Moneyhub, and TrueLayer. The comparison covers accounts, balances, transactions, credit-card handling, regular-payment support, webhook support, and target institutions to validate.

Enabled now: consent start/callback, encrypted server-side token storage, accounts, balances, recent transactions, simple deterministic category hints, Firestore persistence, and dashboard values from synced bank data. Deliberately delayed: payments, transfers, AI coach, production Open Banking review, and webhook-driven sync.

Target validation list:

- American Express
- Nationwide
- Revolut

Do not treat provider capability as confirmed until it has been tested with the provider sandbox or live test mode, appropriate credentials, redirect URL configuration, webhook configuration, and secure token storage.

## Provider Payload Inspection

Sandbox provider payload inspection is opt-in and server-only. It is intended for mapper hardening before advanced enrichment work.

To capture redacted Moneyhub sandbox payload samples:

```bash
OPEN_BANKING_PROVIDER=moneyhub
OPEN_BANKING_PROVIDER_PAYLOAD_DEBUG=true
PROVIDER_PAYLOAD_DEBUG_DIR=.debug/provider-payloads
```

Then run the app, sign in, complete a Moneyhub sandbox connection from Settings / Connected Accounts, and run a manual sync. Redacted inspection files are written under `.debug/provider-payloads`, which is gitignored.

Each inspection file includes:

- redacted account or transaction payload samples
- unmapped fields
- missing required fields
- optional fields present
- unknown account subtypes
- unknown transaction categories

The redactor removes tokens, account numbers, full names, addresses, account references, provider IDs, user IDs, connection IDs, IBANs, PANs, and token-like strings. Do not commit `.debug` output. Committed tests use only synthetic fixtures from `tests/fixtures/moneyhub-provider-payloads.ts`.

## Sync Workflow

The sync workflow:

- Reads provider accounts through the selected adapter.
- Maps provider account payloads into app account models.
- Upserts accounts.
- Requests provider sync where supported.
- Reads recent provider transactions for each synced provider account.
- Maps provider transaction payloads into app transaction models.
- Upserts transactions using stable provider transaction IDs and a dedupe index.
- Preserves reviewed user categories, merchant overrides, notes, and transfer flags when repeat syncs update an existing transaction.
- Reconciles pending-to-posted changes, provider status changes, soft-deleted provider transactions, and restored provider transactions.
- Records `provider_sync_events`.
- Updates `bank_connections` status and `lastSyncedAt`.
- Creates in-app notifications for connection success, sync success, sync failure, consent attention, and connection revocation.
- Records failures with safe user-facing messages only.

## Event-Driven Sync

Phase 8A handles Moneyhub sandbox transaction webhooks for:

- `newTransactions`
- `updatedTransactions`
- `deletedTransactions`
- `restoredTransactions`
- sync completed events where available
- sync failed events where available

Webhook handling is idempotent by `provider + provider_event_id`. If the same webhook arrives twice, the app returns a safe success response and does not duplicate sync jobs, notifications, or audit events.

The sync queue supports:

- `enqueueConnectionSync()`
- `enqueueAccountSync()`
- `processPendingSyncJobs()`
- `markSyncJobComplete()`
- `markSyncJobFailed()`

Use Supabase for persistent webhook events and sync jobs when configured. Without Supabase, tests and local development use mock/in-memory fallback. Scheduled fallback sync should be configured with `CRON_SECRET`.

Call scheduled sync with `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`. The route skips disconnected, revoked, expired, re-consent, and recently synced connections to avoid excessive provider polling.

Transaction notifications remain privacy-safe outside the authenticated app. Browser-safe copy uses generic wording such as "New transaction detected", "Transaction updated", "Account connection needs attention", and "Potential duplicate payment".

Target real-world institutions remain:

- American Express
- Nationwide
- Revolut

These are target institutions for the first real sandbox test once provider access is available. The UI does not claim guaranteed provider support.

## Transaction Intelligence

Phase 8B is deterministic-first. AI categorisation is not integrated yet.

Enrichment is implemented in `src/lib/transaction-intelligence.ts` and repository persistence is exposed through `src/lib/repositories/finance-repository.ts`.

The enrichment flow:

- Normalises noisy merchant descriptions, such as `AMZNMktplace*UK`, `APPLE.COM/BILL`, `PAYPAL *SPOTIFY`, `TESCO STORES`, `SAINSBURYS S/MKTS`, `REVOLUT TRANSFER`, and `AMEX PAYMENT`.
- Applies user-editable merchant rules before fallback category rules.
- Assigns deterministic categories including income, rent or mortgage, council tax, utilities, groceries, eating out, transport, subscriptions, entertainment, shopping, pets, health, insurance, savings, debt repayment, transfers, cash withdrawal, fees, and other.
- Detects likely own-account transfers from matching opposite amounts, transfer keywords, account context, Revolut/Nationwide transfer patterns, and American Express credit-card repayment patterns.
- Excludes detected transfers from spending totals by default while keeping them visible and reviewable in Transactions.
- Detects monthly, weekly, and annual recurring payment candidates by merchant, account, direction, date cadence, amount tolerance, and occurrence count.
- Splits recurring candidates into bill-like items and subscription-like items using deterministic category and merchant signals.
- Detects subscription price changes, duplicate-looking transactions, missing expected bills, unusually large transactions, and other first-pass review warnings.
- Builds cashflow events from bills, subscriptions, manual finance items, and income candidates while respecting account purpose and cashflow inclusion flags.
- Forecasts upcoming bills before payday, expected income, projected account balances, projected safe-to-spend, and projected bills account balance.

Review workflow support:

- Approve detected bills.
- Approve detected subscriptions.
- Dismiss recurring candidates.
- Edit transaction merchant and category.
- Mark a transaction as transfer or not transfer.
- Exclude a transaction from spending.
- Mark a subscription inactive.
- Preserve reviewed decisions through repository functions and mock fallback.

Phase 8B notifications are in-app only and privacy-safe outside the authenticated app. New notification types include new bill detected, new subscription detected, subscription price changed, missing expected bill, unusual spending, projected bills account shortfall, and transaction needs review.

Future AI enrichment should use the deterministic output as context and suggest explanations or category changes only. AI should not silently recategorise, change budgets, create rules, or alter reviewed decisions without explicit user confirmation.

## AI Money Coach

Phase 9 adds the AI Money Coach as an explanation and planning layer. Calculations remain deterministic in application code.

Server-only modules:

- `src/lib/ai/openai-client.ts`
- `src/lib/ai/money-coach.ts`
- `src/lib/ai/prompts.ts`
- `src/lib/ai/context-builder.ts`
- `src/lib/ai/guardrails.ts`
- `src/lib/ai/redaction.ts`

Required OpenAI placeholders:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_ORG_ID=
OPENAI_PROJECT_ID=
```

OpenAI remains optional. Without `OPENAI_API_KEY`, the app uses a deterministic fallback summary and records an `openai_not_configured` AI insight/notification path when the authenticated route is used.

Supported modes:

- `monthly_review`
- `weekly_review`
- `payday_plan`
- `can_i_afford_this`
- `budget_explainer`
- `bill_review`
- `subscription_review`
- `cashflow_review`
- `debt_summary`
- `net_worth_summary`
- `anomaly_explainer`
- `free_question`

The finance context builder gathers summaries for account balances by purpose, safe-to-spend, bills before payday, upcoming bills and subscriptions, cashflow forecast, budget usage, savings goals, debts and liabilities, manual finance items, anomalies, recent transactions, reviewed transfer exclusions, and detected items needing review.

Data minimisation rules:

- Do not send provider access tokens.
- Do not send refresh tokens.
- Do not send bank login credentials.
- Do not send full account numbers.
- Do not send raw provider payloads.
- Do not send unnecessary transaction-level history.
- Redact provider IDs, connection IDs, account references, long identifiers, email addresses, token-like fields, and raw payload fields before AI use.
- Prefer aggregated summaries and source counts; use deeper transaction context only for questions that need it.

Structured AI responses include:

- `answerSummary`
- `keyNumbers`
- `explanation`
- `assumptions`
- `risksOrWatchouts`
- `suggestedNextActions`
- `confidence`
- `dataUsed`

Guardrails:

- Explain that calculations come from the deterministic finance engine.
- Separate facts, assumptions, risks, and suggested actions.
- Use calm UK-friendly wording.
- Avoid regulated investment, pension transfer, mortgage, tax filing, and formal debt-solution advice.
- Never tell the user to move money automatically.
- Require explicit confirmation before external actions, provider changes, rules, emails, budget changes, or account changes.

AI insight storage:

- Uses the existing `ai_insights` table extended by `20260706000000_phase9_ai_money_coach.sql`.
- Stores prompt summary, redacted context summary, response summary, data-used counts, model, mode, and error status.
- Does not store full raw sensitive context unnecessarily.

Cost and rate controls:

- In-memory per-user hourly request limit placeholder.
- Max context size guard before sending to OpenAI.
- 20 second server-side timeout.
- Safe fallback on OpenAI errors.

Troubleshooting:

- `OpenAI not configured`: set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`.
- `Sign in required`: the API route requires Supabase auth when called from the browser.
- `AI response fallback`: check OpenAI credentials, model name, network access, and server logs without printing sensitive context.
- `Missing data`: connect or sync accounts, review detected transactions, and keep manual entries current.

The app provides personal finance coaching and explanations. Regulated advice areas remain educational and should be handled carefully before any broader product use.

## RLS Expectations

All user-owned tables include `user_id` and have Row Level Security enabled. Policies only allow authenticated users to select, insert, update, or delete rows where `auth.uid() = user_id`.

The migration covers:

- profiles
- accounts
- bank_connections
- provider_accounts
- transactions
- categories
- budgets
- budget_periods
- bills
- subscriptions
- savings_goals
- debts
- manual_finance_items
- net_worth_snapshots
- ai_insights
- alerts
- provider_sync_events
- provider_webhook_events
- sync_jobs
- provider_tokens
- merchant_rules
- transaction_enrichments
- recurring_payment_candidates
- detected_bills
- detected_subscriptions
- spending_anomalies
- cashflow_events
- audit_log
- notification_preferences
- notification_rules
- app_notifications
- push_subscriptions

Push subscription records are treated as sensitive. The current implementation stores placeholder metadata only and does not store real browser push endpoint internals.

## Mobile And PWA

The app is designed for desktop, tablet, iPhone Safari, and iPhone Home Screen PWA mode.

Mobile expectations:

- Keep primary actions reachable with touch targets of at least 44px.
- Keep the bottom navigation clear of `env(safe-area-inset-bottom)` and the iPhone Home indicator.
- Use stacked cards or horizontal scroll for dense finance tables.
- Avoid cramped dashboard cards and preserve readable financial figures.
- Preserve protected route and sign-out behaviour on mobile.

iPhone install steps:

1. Open Personal Finance HQ in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Open from the Home Screen icon.

PWA files:

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/offline.html`
- `public/icons/icon-192.svg`
- `public/icons/icon-512.svg`
- `public/icons/apple-touch-icon.svg`

The service worker registers from `src/components/pwa/service-worker-registrar.tsx`, provides a simple offline fallback, handles notification click events, and contains placeholder push handling. Real push delivery is not enabled.

## Notification Architecture

Domain types:

- `NotificationPreference`
- `NotificationRule`
- `AppNotification`
- `PushSubscriptionRecord`

Notification channels:

- `in_app`
- `web_push`
- `email_placeholder`

Notification severities:

- `info`
- `warning`
- `urgent`

Notification generation is deterministic in `src/lib/notifications.ts`:

- Low balance when safe-to-spend falls below the configured threshold.
- Bill due when a bill is due within the configured reminder window.
- Budget warning when usage exceeds the configured percentage.
- Consent renewal when account consent is expired or expiring soon.
- Sync failure when a provider connection has failed.
- New or updated transactions from provider webhooks.
- Large transaction and potential duplicate payment alerts when transaction activity warrants review.
- Manual review when a manual item review date is due.
- Safe-to-spend change when the value changes materially.
- New detected bills, subscriptions, subscription price changes, missing expected bills, unusual spending, projected bills-account shortfalls, and transactions needing review.
- AI monthly review ready, AI payday plan ready, AI review failed, and OpenAI not configured.

Repository functions live in `src/lib/repositories/notification-repository.ts` and use Supabase when configured, with mock/local fallback otherwise.

## Notification Privacy

Notification text shown outside the authenticated app is privacy-safe by default. Browser notification copy should use generic wording such as:

- Bill due soon
- Budget warning
- Account connection needs attention
- Manual item needs review
- Safe-to-spend changed
- New transaction detected
- Potential duplicate payment

Detailed amounts, bank names, bill names, and account names should only appear inside the authenticated app.

Real push notification delivery is available when VAPID keys and `NOTIFICATION_DELIVERY_ENABLED=true` are configured. It requires explicit browser permission, secure push subscription storage, endpoint redaction, privacy-safe payloads, and ongoing security review.

## Web Push And Scheduled Alerts

Phase 10 enables real Web Push delivery when explicitly configured.

Server-only modules:

- `src/lib/notifications/web-push.ts`
- `src/lib/notifications/push-subscriptions.ts`
- `src/lib/notifications/notification-delivery.ts`
- `src/lib/notifications/scheduled-alerts.ts`

VAPID setup:

```bash
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_SUBJECT=mailto:admin@example.com
NOTIFICATION_DELIVERY_ENABLED=false
```

The VAPID private key is server-only. The browser only receives the public key needed by `PushManager.subscribe()`.

iPhone PWA behaviour:

- Open Personal Finance HQ in Safari.
- Use Share -> Add to Home Screen.
- Open the app from the Home Screen icon.
- Tap Enable Notifications in Settings.
- iPhone Web Push requires the installed Home Screen PWA. Browser-tab Safari alone is not enough.

Push subscription storage:

- Push subscriptions are sensitive.
- Endpoint, `p256dh`, and `auth` are stored server-side only.
- UI responses expose status and endpoint hash only.
- Push payloads use `privacySafeTitle` and `privacySafeBody`.
- Detailed amounts, merchants, bank names, account names, and account references stay inside the authenticated app.

Scheduled alert architecture:

- `GET /api/notifications/scheduled` is protected by `CRON_SECRET`.
- It can be called by Vercel Cron, Supabase Cron, manual admin/dev curl, or a future queue worker.
- It generates deterministic alerts for due bills, subscription/manual recurring items, budget thresholds, low safe-to-spend, projected bills-account shortfall, consent renewal, sync failure, manual review due, payday planning, and monthly/weekly AI review hooks.
- Scheduled AI reviews are disabled by default with `AI_SCHEDULED_REVIEWS_ENABLED=false`.
- When enabled, scheduled AI review hooks use deterministic fallback unless OpenAI is configured and explicitly enabled in the relevant code path.

Dedupe rules:

- Notification IDs include user-relevant type, entity, alert date/window, and severity.
- Repeated scheduled runs upsert the same notification ID instead of creating duplicates.
- Budget threshold and bill due alerts remain stable within the same alert window.

Preference and quiet-hours rules:

- In-app notifications respect notification type enablement.
- Web Push delivery requires the `web_push` channel.
- Push delivery is skipped during quiet hours.
- Urgent alerts can still be created in-app during quiet hours; external push copy remains generic.

Delivery logging:

- `notification_delivery_attempts` records channel, status, attempted time, delivery/failure time, failure reason, and provider response code.
- Delivery logs are user-owned and protected by RLS.

Vercel Cron:

`vercel.json` includes:

- `/api/notifications/scheduled`
- `/api/bank-connections/scheduled-sync`

Supabase Cron option:

Call the same HTTP routes with either `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`.

Troubleshooting:

- Push unavailable on iPhone: confirm the app was launched from the Home Screen PWA.
- Permission denied: ask the browser/user to re-enable notifications; do not request permission automatically.
- Delivery skipped: check `NOTIFICATION_DELIVERY_ENABLED`, VAPID keys, quiet hours, notification channels, and active push subscriptions.
- Cron rejected: check `CRON_SECRET`.
- Duplicate alerts: check notification ID windows and source entity IDs before changing dedupe rules.

## Staging Deployment

v2 makes Netlify + Firebase the primary free staging deployment path, with Vercel remaining supported as a secondary option. Supabase has been removed from the primary path.

Readiness:

- Visit `/settings/system-readiness`.
- Confirm the deployment platform shows Netlify for Netlify staging.
- Confirm backend provider, Firebase client/admin and Firestore status, mock fallback, cron, base URL, optional TrueLayer sandbox, optional OpenAI, and optional Web Push checks.
- The page shows labels, status, safe details, and remediation only. It must not show secret values.

Netlify deployment steps:

1. Create a Netlify site from this repository.
2. Use `netlify.toml` for the build command, Next.js plugin, and scheduled function directory.
3. Set staging environment variables in the Netlify UI.
4. Keep service-role, provider, OpenAI, VAPID private key, and cron secret values server-side.
5. Set `APP_BASE_URL` to the Netlify staging URL.
6. Deploy staging.
7. Run the smoke test checklist in `docs/staging-smoke-test.md`.

Required for basic Netlify + Firebase staging:

```bash
BACKEND_PROVIDER=firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
APP_BASE_URL=
CRON_SECRET=
MOCK_DATA_FALLBACK_ENABLED=true
```

Supabase has been removed from the primary path; `BACKEND_PROVIDER=supabase` now degrades safely to mock. Use `firebase` for staging or `mock` for a no-backend demo.

Optional Netlify integrations:

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

Vercel deployment steps:

1. Create a Vercel project from this repository.
2. Set staging environment variables in Vercel Project Settings.
3. Keep service-role, provider, OpenAI, VAPID private key, and cron secret values server-side.
4. Deploy preview/staging.
5. Run the smoke test checklist in `docs/staging-smoke-test.md`.

Supabase project setup:

1. Create a Supabase staging project.
2. Add the staging site URL and `/auth/callback` to Auth redirect URLs.
3. Apply migrations.
4. Confirm RLS policies are enabled.
5. Use fake demo data only.

Migration runner guidance:

```bash
supabase db push
supabase migration list
```

Seed fake demo data only through reviewed local scripts or Supabase SQL snippets. Do not seed real financial data. Clear demo data before re-running sensitive tests. Verify RLS by checking every user-owned table has `user_id`, RLS enabled, and policies scoped to `auth.uid() = user_id`.

Moneyhub sandbox setup:

- Set the staging callback URL to `/api/bank-connections/callback`.
- Set the staging webhook URL to `/api/bank-connections/webhook/moneyhub`.
- Use sandbox credentials only.
- Confirm callback and webhook failures remain provider-safe.

TrueLayer sandbox setup:

- Set the staging callback URL to `/api/bank-connections/callback`.
- Set the staging webhook URL to `/api/bank-connections/webhook/truelayer` only before testing webhooks.
- Use sandbox credentials only and configure a 32+ character `TOKEN_ENCRYPTION_KEY`.
- Confirm callback and webhook failures remain provider-safe.

OpenAI setup:

- Set the OpenAI key server-side only.
- Keep OpenAI optional; deterministic fallback must still work.
- Confirm no raw provider payloads or unnecessary transaction-level data are sent.

VAPID setup:

- Generate VAPID keys with a trusted local tool or provider dashboard.
- Store the public key and private key in deployment environment variables.
- Keep `WEB_PUSH_ENABLED=false` and `NOTIFICATION_DELIVERY_ENABLED=false` until staging push tests are planned.

Cron setup:

- Use Netlify scheduled functions in `netlify/functions` for primary staging.
- Use `vercel.json` for Vercel Cron when deploying the secondary path.
- Supabase Cron may call the same HTTP routes.
- Always send `CRON_SECRET`.
- Confirm invalid secrets return 401.

iPhone PWA test:

- Open staging in Safari.
- Tap Share -> Add to Home Screen.
- Open from the Home Screen icon.
- Enable notifications only from Settings.
- Send a test notification.
- Confirm external copy is privacy-safe.

Rollback:

- Keep the previous Netlify deployment available.
- Revert to the previous Netlify deployment if smoke tests fail.
- Keep the previous Vercel deployment available if using the secondary path.
- Roll back database changes only with a reviewed migration plan.
- Rotate secrets if a staging secret is exposed.

Supporting docs:

- `docs/netlify-deployment.md`
- `docs/staging-smoke-test.md`
- `docs/security-checklist.md`
- `docs/deployment-checklist.md`

## Provider Abstraction

Provider names supported by the model:

- `moneyhub`
- `truelayer`
- `tink`
- `plaid`
- `mock`

The adapter interface supports:

- `createConnection()`
- `getConnectionStatus()`
- `getAccounts()`
- `getTransactions()`
- `refreshConnection()`
- `revokeConnection()`

Phase 12A keeps `mockOpenBankingProvider` available and supports Moneyhub plus TrueLayer sandbox adapter options behind the provider abstraction. Tink and Plaid remain modelled provider names only. Real provider integration requires a provider account, sandbox credentials, OAuth redirect URLs, webhook configuration, secure token storage, and a separate security review before any live financial data is connected.

## Open Banking Token Boundary

`src/lib/bank-providers/token-store.ts` is server-only and stubbed in this phase.

Provider tokens must never be exposed to browser code. The current store saves only encrypted-token placeholder metadata, token references, scopes, expiry metadata, and revocation metadata. Future production token storage should use encrypted storage or provider-managed token vaulting where available. Real access tokens and refresh tokens must not be committed, logged, returned from API routes, or stored by client-side code.

## Sandbox Environment

Open Banking sandbox placeholders:

```bash
OPEN_BANKING_PROVIDER=moneyhub
OPEN_BANKING_ENABLED=false
AI_MONEY_COACH_ENABLED=false
WEB_PUSH_ENABLED=false
SCHEDULED_ALERTS_ENABLED=false
MONEYHUB_SANDBOX_ENABLED=false
TRUELAYER_SANDBOX_ENABLED=false
MOCK_DATA_FALLBACK_ENABLED=true
OPEN_BANKING_CLIENT_ID=
OPEN_BANKING_CLIENT_SECRET=
OPEN_BANKING_REDIRECT_URI=http://localhost:3000/api/bank-connections/callback
OPEN_BANKING_WEBHOOK_SECRET=
MONEYHUB_CLIENT_ID=
MONEYHUB_CLIENT_SECRET=
MONEYHUB_REDIRECT_URI=http://localhost:3000/api/bank-connections/callback
MONEYHUB_WEBHOOK_SECRET=
MONEYHUB_API_BASE_URL=https://api.moneyhub.co.uk/v2.0
MONEYHUB_AUTH_BASE_URL=https://identity.moneyhub.co.uk
MONEYHUB_JWKS_URL=
MONEYHUB_PRIVATE_KEY=
MONEYHUB_KEY_ID=
TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=
TRUELAYER_REDIRECT_URI=http://localhost:3000/api/bank-connections/callback?provider=truelayer
TRUELAYER_API_BASE_URL=https://api.truelayer-sandbox.com
TRUELAYER_AUTH_BASE_URL=https://auth.truelayer-sandbox.com
TRUELAYER_WEBHOOK_SECRET=
TRUELAYER_SCOPES=info accounts balance cards transactions offline_access
OPEN_BANKING_PROVIDER_PAYLOAD_DEBUG=false
PROVIDER_PAYLOAD_DEBUG_DIR=.debug/provider-payloads
CRON_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_ORG_ID=
OPENAI_PROJECT_ID=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_SUBJECT=mailto:admin@example.com
NOTIFICATION_DELIVERY_ENABLED=false
AI_SCHEDULED_REVIEWS_ENABLED=false
```

Do not commit real credentials, client secrets, access tokens, refresh tokens, consent artefacts, or real financial data.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Firebase Auth and Firestore
- Supabase
- Recharts
- Vitest
- ESLint

## Setup

Requires Node.js 20.9 or newer. This scaffold was verified with Node.js 22.13.0.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
```

## Data Model Overview

Core domain types:

- `UserProfile`
- `Account`
- `BankConnection`
- `ProviderAccount`
- `ProviderTransaction`
- `ProviderSyncEvent`
- `ProviderWebhookEvent`
- `SyncJob`
- `Category`
- `Transaction`
- `Budget`
- `BudgetPeriod`
- `Bill`
- `Subscription`
- `SavingsGoal`
- `Debt`
- `NetWorthSnapshot`
- `AIInsight`
- `Alert`
- `NotificationPreference`
- `NotificationRule`
- `AppNotification`
- `PushSubscriptionRecord`
- `NotificationDeliveryAttempt`
- `MerchantRule`
- `TransactionEnrichment`
- `RecurringPaymentCandidate`
- `DetectedBill`
- `DetectedSubscription`
- `SpendingAnomaly`
- `CashflowEvent`
- `AIMoneyCoachMode`
- `AIMoneyCoachResponse`
- `AIDataUsedSummary`
- `ManualFinanceItem`

Account purposes:

- `main_current_account`
- `bills_account`
- `everyday_spending`
- `emergency_fund`
- `short_term_savings`
- `holiday_fund`
- `pet_fund`
- `house_deposit`
- `credit_card`
- `loan_account`
- `pension`
- `investment`
- `cash`
- `offline_account`
- `other`

Manual items are included deterministically:

- Cashflow forecast when `includeInCashflow` is `true`.
- Net worth when `includeInNetWorth` is `true`.
- Upcoming bills when `type` is `manual_bill` or `future_expense`.
- Debt planner when `direction` is `liability` or `payable`.

## Repository Layout

```text
personal-finance-hq/
|- docs/
|  |- project-definition.md
|  |- functional-design.md
|  |- technical-architecture.md
|  `- *.docx source documents
|- supabase/
|  `- migrations/
|- firebase/
|  `- firestore.rules
|- public/
|  |- manifest.webmanifest
|  |- sw.js
|  `- icons/
|- src/
|  |- app/
|  |- components/
|  |- lib/bank-providers/
|  `- lib/
|- tests/
|- AGENTS.md
|- README.md
`- backlog.md
```

## Data Boundary

Seeded values are fake and live in `src/lib/mock-data.ts` or deterministic mock provider data in `src/lib/bank-providers/mock-open-banking-provider.ts`. Moneyhub code is sandbox-ready only and must not include real credentials. Do not add real bank data, account credentials, Open Banking tokens, OpenAI secrets, Supabase credentials, or real personal financial records to the repository.

## Documentation

- [Project definition](docs/project-definition.md)
- [Functional design](docs/functional-design.md)
- [Technical architecture](docs/technical-architecture.md)
- [Backlog](backlog.md)
- [Codex project instructions](AGENTS.md)

The Word source documents are kept in `docs/`. The Markdown files summarise them for cleaner Codex and developer workflows.
