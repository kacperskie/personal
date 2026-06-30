# Personal Finance HQ

Private UK-focused personal finance dashboard with an AI money coach.

The product goal is to help the user understand spending, budgets, bills, subscriptions, savings goals, cashflow, debt, and net worth. Phase 2 adds a typed local finance domain model, richer mock seed data, deterministic calculation functions, and unit tests. CSV import, Supabase, OpenAI, Open Banking, real bank integrations, and real financial data remain out of scope.

## Current Phase

Phase 2: finance domain model and manual finance input model.

Implemented locally:

- Next.js dashboard shell with sidebar navigation.
- Dashboard, Transactions, Budgets, Bills & Subscriptions, Goals, AI Coach, and Settings pages.
- TypeScript domain types in `src/lib/domain.ts`.
- Typed mock seed data in `src/lib/mock-data.ts`.
- Deterministic finance calculations in `src/lib/finance.ts`.
- Unit tests for finance calculations in `tests/finance.test.ts`.

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
```

## Data Model Overview

Core domain types:

- `UserProfile`
- `Account`
- `Transaction`
- `Category`
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

`ManualFinanceItem` supports manual debts, money owed to the user, money the user owes to others, offline accounts, cash, pension estimates, ISA/investment balances, one-off future expenses, manual recurring bills, and manual recurring income.

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

All values are mock seed data in `src/lib/mock-data.ts`. Do not add real bank data, account credentials, Open Banking tokens, OpenAI secrets, Supabase credentials, or real personal financial records to the repository.

## Documentation

- [Project definition](docs/project-definition.md)
- [Functional design](docs/functional-design.md)
- [Technical architecture](docs/technical-architecture.md)
- [Backlog](backlog.md)
- [Codex project instructions](AGENTS.md)

The Word source documents are kept in `docs/`. The Markdown files summarise them for cleaner Codex and developer workflows.
