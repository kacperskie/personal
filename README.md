# Personal Finance HQ

Private UK-focused personal finance dashboard with an AI money coach.

The product goal is to help the user understand spending, budgets, bills, subscriptions, savings goals, cashflow, debt, and net worth. Phase 4 adds Supabase-ready persistence, authentication foundations, database migrations, RLS policies, repository fallbacks, and the secure boundary needed before future direct account connections.

## Current Phase

Phase 4: Supabase persistence, authentication, database schema, and secure Open Banking foundation.

Implemented locally:

- Next.js dashboard shell with sidebar navigation.
- Dashboard, Accounts, Transactions, Budgets, Bills & Subscriptions, Goals, Manual Entries, AI Coach, Settings, and Settings / Connected Accounts pages.
- Supabase browser, server, and service-role client helpers.
- Supabase-compatible sign-in page with email/password and magic-link flow.
- Protected app routes when Supabase is configured.
- Basic user profile creation on sign-in.
- SQL migration for finance tables, provider sync state, audit log, provider token placeholders, and RLS policies.
- Repository layer that reads from Supabase when configured and falls back to mock/local data otherwise.
- Editable Accounts page for account purpose, inclusion flags, and linked savings goals.
- Editable Manual Entries page for create, update, delete, inclusion flags, status, and review dates.
- Server-only provider token boundary stub. Real tokens are not stored in this phase.
- Unit tests for finance calculations, repository fallback, validation, migration coverage, audit helpers, and token-store boundaries.

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

Apply the Phase 4 migration in Supabase:

```bash
supabase db push
```

Or run the SQL in:

```text
supabase/migrations/20260701000000_phase4_secure_foundation.sql
```

When Supabase variables are missing, the app intentionally falls back to mock/local data so local UI and calculation work can continue without a database.

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

Phase 4 still uses `mockOpenBankingProvider` only. Real provider integration requires a provider account, sandbox credentials, OAuth redirect URLs, webhook configuration, secure token storage, and a separate security review before any live financial data is connected.

## Open Banking Token Boundary

`src/lib/bank-providers/token-store.ts` is server-only and stubbed in this phase.

Provider tokens must never be exposed to browser code. Future production token storage should use encrypted storage or provider-managed token vaulting where available. Real access tokens and refresh tokens must not be committed, logged, or stored by client-side code.

## Sandbox Environment

Open Banking sandbox placeholders:

```bash
OPEN_BANKING_PROVIDER=mock
OPEN_BANKING_CLIENT_ID=
OPEN_BANKING_CLIENT_SECRET=
OPEN_BANKING_REDIRECT_URI=http://localhost:3000/api/open-banking/callback
OPEN_BANKING_WEBHOOK_SECRET=
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
|- src/
|  |- app/
|  |- components/
|  `- lib/
|- tests/
|- AGENTS.md
|- README.md
`- backlog.md
```

## Data Boundary

Seeded values are fake and live in `src/lib/mock-data.ts` or deterministic mock provider data in `src/lib/bank-providers/mock-open-banking-provider.ts`. Do not add real bank data, account credentials, Open Banking tokens, OpenAI secrets, Supabase credentials, or real personal financial records to the repository.

## Documentation

- [Project definition](docs/project-definition.md)
- [Functional design](docs/functional-design.md)
- [Technical architecture](docs/technical-architecture.md)
- [Backlog](backlog.md)
- [Codex project instructions](AGENTS.md)

The Word source documents are kept in `docs/`. The Markdown files summarise them for cleaner Codex and developer workflows.
