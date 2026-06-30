# Personal Finance HQ

Private UK-focused personal finance dashboard with an AI money coach.

The product goal is to help the user understand spending, budgets, bills, subscriptions, savings goals, cashflow, debt, and net worth. Phase 3 adds the connected accounts foundation, account-purpose assignment, mock Open Banking provider abstraction, and manual entries for data providers cannot see.

## Current Phase

Phase 3: connected accounts foundation and account-purpose assignment.

Implemented locally:

- Next.js dashboard shell with sidebar navigation.
- Dashboard, Accounts, Transactions, Budgets, Bills & Subscriptions, Goals, Manual Entries, AI Coach, Settings, and Settings / Connected Accounts pages.
- Extended `Account` model with provider IDs, institution metadata, purpose, role, inclusion flags, linked goals, sync status, consent timestamps, and notes.
- Provider connection types: `BankConnection`, `BankProvider`, `ProviderAccount`, `ProviderTransaction`, `ProviderSyncEvent`, and `ConsentStatus`.
- Mock Open Banking adapter in `src/lib/bank-providers`.
- Typed mock seed data for American Express, Nationwide, and Revolut.
- Deterministic calculations for safe-to-spend, bills balance, cashflow inclusion, net worth, liabilities, own-account transfer exclusion, and linked savings goal balances.
- Unit tests for finance rules and the mock provider adapter.

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

Phase 3 uses `mockOpenBankingProvider` only. Real provider integration requires a provider account, sandbox credentials, OAuth redirect URLs, webhook configuration, secure token storage, and a separate security review before any live financial data is connected.

## Sandbox Environment

Copy `.env.example` when real sandbox work begins:

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

All values are mock seed data in `src/lib/mock-data.ts` or deterministic mock provider data in `src/lib/bank-providers/mock-open-banking-provider.ts`. Do not add real bank data, account credentials, Open Banking tokens, OpenAI secrets, Supabase credentials, or real personal financial records to the repository.

## Documentation

- [Project definition](docs/project-definition.md)
- [Functional design](docs/functional-design.md)
- [Technical architecture](docs/technical-architecture.md)
- [Backlog](backlog.md)
- [Codex project instructions](AGENTS.md)

The Word source documents are kept in `docs/`. The Markdown files summarise them for cleaner Codex and developer workflows.
