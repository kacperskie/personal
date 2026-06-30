# Backlog

Source: `docs/Personal_Finance_Dashboard_Project_Definition_Document.docx`, summarised for implementation planning.

## MVP Epics

### EPIC-01 Dashboard Foundation
- Build responsive app shell, navigation, routing, and design system.
- Create dashboard summary cards for current cash, safe-to-spend, upcoming bills, budget health, goals, alerts, and AI summary.
- Start with mock data before connecting real imports.

### EPIC-02 Data Ingestion
- Add CSV upload for current account and credit-card transactions.
- Support configurable column mapping for unknown CSV formats.
- Normalise rows into canonical transactions.
- Deduplicate by provider transaction ID where available, then deterministic fingerprint.
- Store import batch metadata, row counts, skipped duplicates, and errors.

### EPIC-03 Transaction Management
- Build transaction search and filters by date, account, merchant, category, amount, review status, and recurrence.
- Allow inline category and notes editing.
- Add merchant rule proposals and user-approved persistent rules.
- Support bulk categorisation, exclude-from-budget, and mark-reviewed actions.

### EPIC-04 Budgets
- Add monthly category budgets.
- Show spent, remaining, pace, forecast, and projected overspend.
- Handle transfers and refunds without distorting spend totals.
- Add tests for budget pace and projected overspend.

### EPIC-05 Bills And Subscriptions
- Detect recurring payments by merchant similarity, amount tolerance, and date cadence.
- Group recurring payments as bill, subscription, debt payment, savings transfer, income, or unknown.
- Flag price changes, duplicate payments, renewals, and unconfirmed recurring items.
- Require user confirmation before a recurring payment becomes an official bill or subscription.

### EPIC-06 Safe-To-Spend
- Calculate safe-to-spend from available cash, upcoming bills, planned savings, debt payments, minimum buffer, reserved goal contributions, and confirmed adjustments.
- Let account types be included or excluded from available cash.
- Treat credit-card balances as liabilities and payment commitments.
- Add tests for pending transactions, transfers, bills before payday, and buffer logic.

### EPIC-07 Goals
- Add savings goals with target amount, current amount, target date, priority, and funding source.
- Calculate monthly or payday contribution needed to hit target dates.
- Allow affordability scenarios to become goals.
- Show progress, required contribution, target date, and AI note.

### EPIC-08 AI Coach
- Build AI chat endpoint through a backend-only OpenAI API integration.
- Ground responses through whitelisted tools and deterministic calculations.
- Support weekly review, monthly review, affordability, category explanation, subscription review, payday plan, and debt explanation.
- Require evidence, assumptions, risks, and next action in responses.
- Save insights with prompt version, tool version, and data snapshot reference.
- Add golden prompt tests for affordability, bill changes, overspend, missing data, hallucination checks, and regulated-topic boundaries.

### EPIC-09 Security And Privacy
- Add authentication and user-scoped data access.
- Use encrypted storage, secret management, least privilege, and log redaction.
- Avoid storing bank login credentials, card numbers, security answers, or full account credentials.
- Add export/delete controls.
- Keep Open Banking behind a feature flag.
- Audit imports, settings changes, AI tool calls, approvals, and provider sync events.

### EPIC-10 Testing And Release
- Add unit tests for calculations, parsing, deduplication, recurring detection, and scenarios.
- Add integration tests for CSV import, database writes, APIs, auth boundaries, and AI tool calls.
- Add end-to-end tests for import, categorisation, dashboard review, AI question, budget creation, and data delete.
- Add lint, type-check, test, build, migration check, and release checklist once the app is scaffolded.

## Later Scope

- UK Open Banking integration through a provider adapter.
- Cashflow calendar with projected daily balance.
- Debt payoff planner with snowball and avalanche scenarios.
- Net worth dashboard with manual assets, pensions, and investment balances.
- Scheduled daily, weekly, monthly, and payday briefings.
- Mobile PWA, notification centre, dark mode, and household/shared finance mode.
- Provider actions such as cancellation email drafts or budget rule creation, always requiring explicit confirmation.

## Acceptance Criteria

- The user can upload a CSV file and see imported transactions assigned to an account.
- Re-importing the same CSV does not create duplicate transactions.
- The dashboard shows current cash, upcoming bills, safe-to-spend, budget health, and goal progress from database values.
- The user can edit a transaction category and create a merchant rule.
- The system detects likely recurring payments and shows them for review.
- The AI coach answers monthly review and affordability questions using retrieved data only.
- AI responses show assumptions, calculations, evidence, risks, and a next action.
- AI insights record prompt/tool version and data snapshot reference.
- Sensitive values are not written to application logs in plain text.
- The user can export or delete local finance data from settings.
