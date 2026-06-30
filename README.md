# Personal Finance HQ

Private UK-focused personal finance dashboard with an AI money coach.

The product goal is to help the user understand spending, budgets, bills, subscriptions, savings goals, cashflow, debt, and net worth. Phase 1 is a local dashboard shell using mock seed data only. Open Banking, real bank integrations, live AI calls, and storage of real financial data are intentionally out of scope.

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

## Repository Layout

```text
personal-finance-hq/
├─ docs/
│  ├─ project-definition.md
│  ├─ functional-design.md
│  ├─ technical-architecture.md
│  └─ *.docx source documents
├─ src/
│  ├─ app/
│  ├─ components/
│  └─ lib/
├─ tests/
├─ AGENTS.md
├─ README.md
└─ backlog.md
```

## Phase 1 Pages

- Dashboard
- Transactions
- Budgets
- Bills & Subscriptions
- Goals
- AI Coach
- Settings

## Data Boundary

All values are mock seed data in `src/lib/mock-data.ts`. Do not add real bank data, account credentials, Open Banking tokens, or real personal financial records to the repository.

## Documentation

- [Project definition](docs/project-definition.md)
- [Functional design](docs/functional-design.md)
- [Technical architecture](docs/technical-architecture.md)
- [Backlog](backlog.md)
- [Codex project instructions](AGENTS.md)

The Word source documents are kept in `docs/`. The Markdown files summarise them for cleaner Codex and developer workflows.
