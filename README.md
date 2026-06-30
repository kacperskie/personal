# Personal Finance HQ

Private UK-focused personal finance dashboard with an AI money coach.

The product goal is to help the user understand spending, budgets, bills, subscriptions, savings goals, cashflow, debt, and net worth. Phase 8B adds deterministic transaction enrichment, recurring payment detection, bills and subscription detection, cashflow forecasting, anomalies, and review workflows while keeping the app mock-compatible and privacy-first.

## Current Phase

Phase 8B: transaction enrichment and recurring finance intelligence.

Implemented locally:

- Next.js dashboard shell with sidebar navigation.
- Mobile app shell with bottom navigation, safe-area support, and touch-friendly controls.
- Dashboard, Accounts, Transactions, Budgets, Bills & Subscriptions, Goals, Manual Entries, AI Coach, Settings, and Settings / Connected Accounts pages.
- Notifications page with unread count, severity filtering, mark-read, mark-all-read, dismiss, and action links.
- iPhone PWA metadata, `manifest.webmanifest`, app icon placeholders, Apple touch icon placeholder, and service worker registration.
- Offline fallback page and service worker handlers for fetch, push placeholders, and notification clicks.
- Moneyhub provider implementation in `src/lib/bank-providers/moneyhub-provider.ts` using the official Moneyhub API client behind the provider adapter.
- Provider config, safe errors, payload mappers, provider notifications, and sync workflow helpers under `src/lib/bank-providers`.
- OAuth/consent route handlers for start, callback, sync, and revoke.
- Moneyhub sandbox readiness checker and Settings / Connected Accounts readiness card.
- Event-driven Moneyhub webhook handling at `POST /api/bank-connections/webhook/moneyhub` for transaction and sync events.
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
- Account-purpose default suggestions for American Express, Nationwide, and Revolut account patterns.
- Supabase browser, server, and service-role client helpers.
- Supabase-compatible sign-in page with email/password and magic-link flow.
- Protected app routes when Supabase is configured.
- Basic user profile creation on sign-in.
- SQL migration for finance tables, provider sync state, audit log, provider token placeholders, and RLS policies.
- SQL migration for notification preferences, notification rules, app notifications, and sensitive push subscription placeholders.
- SQL migration for provider transaction update metadata and repeat-sync dedupe index.
- SQL migration for provider webhook events, sync jobs, and provider transaction status fields.
- Repository layer that reads from Supabase when configured and falls back to mock/local data otherwise.
- Editable Accounts page for account purpose, inclusion flags, and linked savings goals.
- Editable Manual Entries page for create, update, delete, inclusion flags, status, and review dates.
- Server-only provider token boundary stub. Real tokens are not stored in this phase.
- Notification repository functions, deterministic notification generation helpers, privacy-safe copy helpers, and audit events.
- Server-only token placeholder store with expiry metadata and client-safe payload helpers.
- Unit tests for finance calculations, repository fallback, validation, migration coverage, audit helpers, token-store boundaries, PWA files, install guidance, notification rules, provider mappers, provider safe errors, unauthenticated routes, Moneyhub readiness and callback handling, webhook parsing/idempotency, synced transaction UI, duplicate handling, reconciliation, sync queue, scheduled sync protection, manual refresh-all, and sync workflow.

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

## Supabase Setup

Copy `.env.example` to `.env.local` and fill Supabase values when database-backed development is needed:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not commit real Supabase credentials.

Apply the migrations in Supabase:

```bash
supabase db push
```

Or run the SQL in:

```text
supabase/migrations/20260701000000_phase4_secure_foundation.sql
supabase/migrations/20260702000000_phase5_notifications_pwa.sql
supabase/migrations/20260703000000_phase7_moneyhub_sync.sql
supabase/migrations/20260704000000_phase8a_event_driven_sync.sql
supabase/migrations/20260705000000_phase8b_transaction_intelligence.sql
```

When Supabase variables are missing, the app intentionally falls back to mock/local data so local UI and calculation work can continue without a database.

## Moneyhub Sandbox Setup

Moneyhub is the first provider implementation target. The current code is sandbox-ready but does not include real credentials and does not make production Open Banking calls.

Required placeholders:

```bash
OPEN_BANKING_PROVIDER=moneyhub
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

Real push notification delivery remains future work. It will require explicit permission, secure push subscription storage, endpoint redaction, VAPID/provider setup, and a security review.

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

Phase 8B keeps `mockOpenBankingProvider` available, uses the Moneyhub sandbox adapter behind the provider abstraction, and builds transaction intelligence on top of synced or mock transaction data. Real provider integration requires a provider account, sandbox credentials, OAuth redirect URLs, webhook configuration, secure token storage, and a separate security review before any live financial data is connected.

## Open Banking Token Boundary

`src/lib/bank-providers/token-store.ts` is server-only and stubbed in this phase.

Provider tokens must never be exposed to browser code. The current store saves only encrypted-token placeholder metadata, token references, scopes, expiry metadata, and revocation metadata. Future production token storage should use encrypted storage or provider-managed token vaulting where available. Real access tokens and refresh tokens must not be committed, logged, returned from API routes, or stored by client-side code.

## Sandbox Environment

Open Banking sandbox placeholders:

```bash
OPEN_BANKING_PROVIDER=moneyhub
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
OPEN_BANKING_PROVIDER_PAYLOAD_DEBUG=false
PROVIDER_PAYLOAD_DEBUG_DIR=.debug/provider-payloads
CRON_SECRET=
```

Do not commit real credentials, client secrets, access tokens, refresh tokens, consent artefacts, or real financial data.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
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
- `MerchantRule`
- `TransactionEnrichment`
- `RecurringPaymentCandidate`
- `DetectedBill`
- `DetectedSubscription`
- `SpendingAnomaly`
- `CashflowEvent`
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
