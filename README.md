# Personal Finance HQ

Private UK-focused personal finance dashboard with an AI money coach.

The product goal is to help the user understand spending, budgets, bills, subscriptions, savings goals, cashflow, debt, and net worth. Phase 6 adds the first real Open Banking sandbox integration foundation while keeping provider-specific code isolated, server-side, and mock-compatible.

## Current Phase

Phase 6: Open Banking sandbox foundation.

Implemented locally:

- Next.js dashboard shell with sidebar navigation.
- Mobile app shell with bottom navigation, safe-area support, and touch-friendly controls.
- Dashboard, Accounts, Transactions, Budgets, Bills & Subscriptions, Goals, Manual Entries, AI Coach, Settings, and Settings / Connected Accounts pages.
- Notifications page with unread count, severity filtering, mark-read, mark-all-read, dismiss, and action links.
- iPhone PWA metadata, `manifest.webmanifest`, app icon placeholders, Apple touch icon placeholder, and service worker registration.
- Offline fallback page and service worker handlers for fetch, push placeholders, and notification clicks.
- Moneyhub provider implementation skeleton in `src/lib/bank-providers/moneyhub-provider.ts`.
- Provider config, safe errors, payload mappers, provider notifications, and sync workflow helpers under `src/lib/bank-providers`.
- OAuth/consent route handlers for start, callback, sync, and revoke.
- Supabase browser, server, and service-role client helpers.
- Supabase-compatible sign-in page with email/password and magic-link flow.
- Protected app routes when Supabase is configured.
- Basic user profile creation on sign-in.
- SQL migration for finance tables, provider sync state, audit log, provider token placeholders, and RLS policies.
- SQL migration for notification preferences, notification rules, app notifications, and sensitive push subscription placeholders.
- Repository layer that reads from Supabase when configured and falls back to mock/local data otherwise.
- Editable Accounts page for account purpose, inclusion flags, and linked savings goals.
- Editable Manual Entries page for create, update, delete, inclusion flags, status, and review dates.
- Server-only provider token boundary stub. Real tokens are not stored in this phase.
- Notification repository functions, deterministic notification generation helpers, privacy-safe copy helpers, and audit events.
- Server-only token placeholder store with expiry metadata and client-safe payload helpers.
- Unit tests for finance calculations, repository fallback, validation, migration coverage, audit helpers, token-store boundaries, PWA files, install guidance, notification rules, provider mappers, provider safe errors, unauthenticated routes, and sync workflow.

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
```

OAuth/consent flow:

- `POST /api/bank-connections/start` creates a provider-agnostic connection record and returns a safe authorization URL when configured.
- `GET /api/bank-connections/callback` handles the provider callback server-side and stores only token placeholder metadata.
- `POST /api/bank-connections/[connectionId]/sync` runs the server-side sync workflow.
- `POST /api/bank-connections/[connectionId]/revoke` disconnects the provider connection and revokes token placeholders.

All provider routes require authentication, run server-side, return provider-safe errors, write audit events, and never expose provider tokens to the browser.

## Sync Workflow

The sync workflow:

- Reads provider accounts through the selected adapter.
- Maps provider account payloads into app account models.
- Upserts accounts.
- Reads recent provider transactions.
- Maps provider transaction payloads into app transaction models.
- Upserts transactions.
- Records `provider_sync_events`.
- Updates `bank_connections` status and `lastSyncedAt`.
- Creates in-app notifications for connection success, sync success, sync failure, consent attention, and connection revocation.
- Records failures with safe user-facing messages only.

Target real-world institutions remain:

- American Express
- Nationwide
- Revolut

These are target institutions for the first real sandbox test once provider access is available. The UI does not claim guaranteed provider support.

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
- provider_tokens
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
- Manual review when a manual item review date is due.
- Safe-to-spend change when the value changes materially.

Repository functions live in `src/lib/repositories/notification-repository.ts` and use Supabase when configured, with mock/local fallback otherwise.

## Notification Privacy

Notification text shown outside the authenticated app is privacy-safe by default. Browser notification copy should use generic wording such as:

- Bill due soon
- Budget warning
- Account connection needs attention
- Manual item needs review
- Safe-to-spend changed

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

Phase 6 keeps `mockOpenBankingProvider` available and adds a Moneyhub sandbox-ready adapter. Real provider integration requires a provider account, sandbox credentials, OAuth redirect URLs, webhook configuration, secure token storage, and a separate security review before any live financial data is connected.

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
