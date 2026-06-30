# Technical Architecture

Source: `Personal_Finance_Dashboard_Technical_Architecture_Document.docx`. Prepared 30 June 2026, version 0.1 draft.

## Overview

Personal Finance HQ is a private web application that stores financial data in a controlled database, exposes calculation and retrieval services through typed APIs, and uses an AI money coach for tool-grounded explanations.

The architecture starts with CSV ingestion and evolves to UK Open Banking provider integrations behind an adapter layer. The database and deterministic services are the system of record. AI receives scoped, purpose-specific data through backend tools and returns explanations, scenarios, and proposed actions with audit metadata.

## Architecture Principles

- System of record outside AI: transactions, budgets, bills, goals, and audit history live in Postgres.
- Least data to AI: send only the minimum summaries and records needed for the user question.
- Deterministic calculations: safe-to-spend, budget pace, cashflow, and debt scenarios are code-owned.
- Provider abstraction: Open Banking providers sit behind an adapter.
- Human approval: persistent rules, external communications, payments, and provider changes require confirmation.
- Audit by design: AI prompts, tools, data snapshots, and approvals are logged.
- Secure by default: encryption, secret management, log redaction, and least privilege apply from MVP.
- Extensible to open finance: model future pensions, investments, mortgages, and broader assets/liabilities.

## Target Architecture

```text
UK Banks / Cards or CSV Export
  -> Open Banking Provider or CSV Import
  -> Provider Adapter / Ingestion API
  -> Backend API and Rules Services
  -> Postgres Finance Ledger

Web Dashboard
  -> Backend API
  -> AI Tool Gateway
  -> OpenAI API
  -> Audit / Insights Logs
```

## Components

- Next.js Web App: dashboard UI, routing, responsive pages, charting, forms, and AI chat panel.
- API Layer: typed endpoints for transactions, budgets, bills, goals, AI tools, imports, and settings.
- Postgres Database: persistent finance entities, rules, insights, imports, and audit logs.
- Ingestion Service: CSV parser and future Open Banking sync with deduplication and normalisation.
- Rules Engine: categorisation, recurring detection, budget pace, safe-to-spend, and alerts.
- AI Tool Gateway: whitelisted functions that retrieve scoped data and run deterministic scenarios.
- OpenAI API: explanation, summarisation, scenario narration, and categorisation suggestions.
- Open Banking Adapter: provider token handling, account sync, transaction sync, balance sync, and webhook translation.
- Job Scheduler: imports, sync refreshes, monthly summaries, alerts, and payday plans.
- Audit Log: user actions, AI tool calls, approvals, imports, and configuration changes.

## Data Flows

### Manual CSV MVP
- User uploads CSV.
- Ingestion validates file type, size, and expected columns.
- User maps columns for unknown formats.
- System normalises rows into canonical transactions.
- Deduplication uses transaction ID where available, then deterministic fingerprint.
- Categorisation uses merchant rules, known patterns, and approved AI-assisted suggestions.
- Transactions and import batch metadata are stored in Postgres.
- Dashboard calculations refresh and AI insight jobs can run.

### Open Banking
- User initiates bank connection from settings.
- Dashboard redirects to provider consent/link flow.
- Provider returns access/refresh tokens or consent artefacts to backend callback.
- Backend stores tokens securely and associates connection with user and provider.
- Sync job retrieves accounts, balances, and transactions through provider adapter.
- Webhooks or scheduled refreshes update data.
- Provider data maps into canonical tables.

### AI Question
- User asks a question in AI coach.
- Backend classifies intent and selects allowed tools.
- Tools retrieve scoped summaries or records from Postgres.
- Deterministic services run required calculations.
- AI receives system rules, user question, tool results, and response template.
- AI returns conclusion, evidence, assumptions, risks, and next action.
- Response, tool versions, and data snapshot reference are saved in audit log.

## AI Architecture

- Use OpenAI API from the backend only.
- Expose whitelisted tools with strict schemas and scoped user context.
- Separate system policy, product behaviour, user question, tool result, and response template.
- Send summaries by default; transaction-level data only when needed.
- Require answers to reference retrieved numbers and state missing data.
- Prohibit autonomous payments, final regulated financial advice, credential collection, and hidden rule creation.
- Evaluate with golden prompt tests for affordability, bill changes, budget overspend, regulated topics, hallucination prevention, and missing data.

## Open Banking Adapter

Provider-specific logic should not leak into the core data model.

```ts
interface BankingProviderAdapter {
  createLinkToken(userId: string): Promise<LinkSession>
  exchangePublicToken(input: unknown): Promise<StoredConnection>
  syncAccounts(connectionId: string): Promise<Account[]>
  syncBalances(connectionId: string): Promise<Balance[]>
  syncTransactions(connectionId: string, cursor?: string): Promise<TransactionPage>
  handleWebhook(payload: unknown): Promise<ProviderEvent>
  revokeConnection(connectionId: string): Promise<void>
}
```

Provider options to validate later: Plaid, TrueLayer, Tink, and Moneyhub.

## API Surface

- `GET /api/dashboard/summary`
- `GET /api/transactions`
- `POST /api/imports/csv`
- `POST /api/transactions/{id}/category`
- `GET /api/budgets`
- `POST /api/budgets`
- `GET /api/bills`
- `GET /api/goals`
- `POST /api/scenarios/affordability`
- `POST /api/ai/chat`
- `POST /api/banking/connect`
- `POST /api/banking/webhook/{provider}`
- `GET /api/audit`

## Logical Data Model

- `users`: owner profile and settings.
- `accounts`: financial accounts and dashboard behaviour.
- `bank_connections`: Open Banking connection metadata and token references.
- `transactions`: canonical transaction ledger.
- `categories`: transaction category taxonomy.
- `merchant_rules`: user-approved categorisation rules.
- `budgets`: category limits by period.
- `recurring_payments`: bills, subscriptions, debt payments, savings transfers, income, and unknown recurring payments.
- `savings_goals`: goals and pots.
- `debts`: debt planner inputs.
- `net_worth_snapshots`: periodic asset/liability snapshots.
- `ai_insights`: saved summaries and explanations.
- `audit_log`: auditable event history.
- `import_batches`: CSV/import metadata and deduplication support.

## Data Classification

- Public: static UI copy, docs, and generic help content.
- Internal: metrics, non-sensitive configuration, and anonymised test data.
- Confidential: user profile, categories, budgets, goals, and insight text.
- Highly Confidential: transactions, balances, Open Banking token references, and AI prompts containing financial data.

## Security And Privacy

- Authentication with Supabase Auth or equivalent, with optional MFA.
- Row-level security by user ID; isolate backend service role from browser code.
- HTTPS/TLS for app, API, provider, and AI calls.
- Managed database encryption and encrypted secret/token storage.
- Environment-specific secrets in managed secret store.
- No secrets in client code or repository.
- AI data minimisation with summaries and scoped rows only.
- Redact transaction descriptions, balances, tokens, email addresses, and prompt payloads from operational logs.
- Audit imports, settings changes, AI insights, tool calls, approvals, and provider sync events.
- User-controlled export/delete.
- Treat imported descriptions and merchant text as untrusted input for prompt-injection safety.
- Use lockfiles, dependency scanning, and regular updates.

## Regulatory Boundaries

- Private MVP is a personal tool with strong privacy controls.
- Public productisation requires separate legal and regulatory assessment.
- Track FCA developments on AI in retail financial services and open finance.
- Keep investments, pensions, mortgages, tax, and formal debt-solution topics educational and signposted unless a compliant regulated support model exists.
- Keep payment initiation out of the MVP.

## Deployment

- Frontend hosting: Vercel or equivalent Next.js hosting.
- Database/auth: Supabase Postgres/Auth or equivalent.
- Backend APIs: Next.js API routes for MVP; consider FastAPI only if backend complexity grows.
- Jobs: Supabase scheduled functions, Inngest, Trigger.dev, or managed cron workers.
- Environments: local, development, staging, production/private beta.
- Configuration: environment variables and managed secrets per environment.
- Storage: short-lived CSV staging storage with deletion after import.
- Monitoring: application logs, job logs, sync metrics, AI usage/cost, and error tracking.
- Backups: managed Postgres backups with tested restore before private beta.

## Observability And Recovery

- Track sync time, provider errors, account counts, and transaction counts.
- Track import hash, rows processed, duplicates skipped, errors, and review queue count.
- Track AI tool errors, token/cost usage, response latency, prompt version, and feedback.
- Track created, dismissed, actioned, and false-positive alerts.
- Test restore before private beta and after schema changes that affect finance records.
- Document incident response for token compromise, data import corruption, provider outage, and AI misstatement.
- Support export of transactions, budgets, bills, goals, and insights.

## Testing And CI/CD

- Unit tests: business rules, parsing, deduplication, safe-to-spend, budget pace, recurring detection, and scenarios.
- API tests: auth boundaries, validation, response schemas, and error handling.
- Database tests: migrations, row-level security, constraints, and seed data.
- AI tests: tool grounding, regulated-topic handling, hallucination prevention, and missing-data behaviour.
- E2E tests: CSV import, budget review, AI scenario, and settings export/delete.
- Security tests: dependency scan, secret scan, log redaction, and token-handling review.
- CI/CD: lint, type-check, test, build, migration check, and deploy to staging before production/private beta.

## Architecture Decisions

- Use a web dashboard as the primary interface.
- Use CSV import for the MVP.
- Use Postgres as the system of record.
- Use an AI tool gateway.
- Use a provider adapter for Open Banking.
- Keep payments out of the MVP.
- Use audit logging from the MVP.
- Design for future open finance extension.
