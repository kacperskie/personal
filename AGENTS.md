# AGENTS.md

## Project
Personal Finance HQ is a private UK-focused personal finance dashboard with an AI money coach.

## Product goal
Build a secure web dashboard that helps the user understand spending, budgets, bills, subscriptions, savings goals, cashflow, debt, and net worth.

## MVP scope
Start with manual CSV import and mock data. Open Banking integration comes after the dashboard, data model, calculations, and AI coach are working.

## Tech stack
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Postgres
- Recharts or ECharts for charts
- OpenAI API for AI summaries and finance coaching

## Build principles
- Keep financial calculations deterministic in code.
- Use AI for explanation, summarisation, categorisation suggestions, and scenario narration.
- Never hard-code real financial data.
- Never store bank login credentials.
- Require explicit user confirmation before any external action.
- Keep Open Banking behind a feature flag.
- Use UK terminology: current account, Direct Debit, standing order, ISA, pension, council tax.

## Safety rules
The AI can explain, summarise, categorise, forecast, and suggest.
The AI requires approval before changing budgets, creating rules, sending emails, moving money, or connecting external accounts.
The AI should avoid regulated investment, pension transfer, mortgage, tax filing, and formal debt-solution advice.

## Development rules
- Make small, reviewable changes.
- Add tests for calculations.
- Keep pages responsive.
- Use accessible UI components.
- Run linting and tests before reporting completion.
- Update README.md when setup or commands change.

## Important documents
Read these before implementation:
- docs/project-definition.md
- docs/functional-design.md
- docs/technical-architecture.md
- backlog.md
