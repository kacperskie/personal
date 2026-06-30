# Project Definition

Source: `Personal_Finance_Dashboard_Project_Definition_Document.docx`. Prepared 30 June 2026, version 0.1 draft.

## Executive Summary

Personal Finance HQ is a private web-based personal finance dashboard with budgeting, cashflow forecasting, bill and subscription monitoring, savings goals, and an embedded AI money coach.

The MVP should prove the experience with manual CSV import before adding consent-based UK Open Banking integrations. The trusted ledger, data model, and deterministic calculations come first; AI is used for explanation, coaching, categorisation support, and scenario narration.

## Vision

Create a personal finance cockpit that quickly answers:

- How much can I safely spend now without risking bills, savings, or debt commitments?
- What changed in my finances this week or month?
- What practical next action would improve my position?

## Objectives

- Consolidate accounts, transactions, budgets, bills, goals, and insights in one dashboard.
- Implement safe-to-spend using current cash, pending bills, committed spend, savings goals, and minimum buffer.
- Provide weekly and monthly AI financial reviews grounded in transaction and budget data.
- Detect recurring bills, subscriptions, price changes, duplicate payments, and unusual spending.
- Support affordability scenarios for planned purchases, holidays, and savings goals.
- Prepare for UK Open Banking providers such as Plaid, TrueLayer, Tink, or Moneyhub.
- Embed privacy, auditability, and human approval controls from the first release.

## MVP Scope

- Responsive web dashboard using manual CSV imports for bank and credit-card transactions.
- Core database for accounts, transactions, categories, budgets, bills, subscriptions, goals, debts, and AI insights.
- Transaction categorisation through merchant rules and AI-assisted suggestions.
- Dashboard with current cash, safe-to-spend, budget health, upcoming bills, and recent alerts.
- Transactions page with search, filters, category editing, and review status.
- Budgets page with category budgets, spend, remaining balance, and projected overspend.
- Bills and subscriptions page with recurring payment detection and price-change flags.
- Savings goals page with target amount, target date, contribution plan, and progress.
- AI Money Coach page and contextual side panel.
- Basic authentication, user settings, audit log, and exportable monthly report.

## Future Scope

- UK Open Banking transaction sync, balance sync, and webhook/event refreshes.
- Cashflow calendar with projected daily balance.
- Debt payoff planner with snowball and avalanche scenarios.
- Net worth dashboard for assets, pensions, investments, and liabilities.
- Automated briefings for daily, weekly, monthly, and payday workflows.
- Mobile PWA, notification centre, dark mode, and household/shared finance mode.
- Explicitly approved provider actions, such as cancellation email drafts or new budget rules.

## Boundaries

- No automated payments in the MVP.
- No automated investment recommendations, pension transfer guidance, mortgage recommendation, tax filing advice, or formal debt-solution advice.
- No storage of bank passwords, card numbers, security answers, or full account credentials.
- No public multi-user launch until regulatory, privacy, security, and provider-contract implications are reviewed.

## Delivery Approach

Use short iterative increments with working software at the end of each phase. Each phase should include requirements refinement, build, test, security review, product review, and documented decisions.

## Roadmap

- M0: Project pack baselined.
- M1: Local dashboard shell with navigation, layout, auth placeholder, and sample data.
- M2: CSV ingestion with upload, normalisation, account mapping, and transaction review.
- M3: Budget and bills MVP with categories, recurring detection, subscription list, and upcoming bills.
- M4: AI coach MVP with grounded summaries, affordability scenarios, monthly review, and audit trace.
- M5: Open Banking sandbox proof of concept.
- M6: Private beta with security review, test pack, backup, and user acceptance complete.

## Quality Strategy

- Unit test safe-to-spend, budget pace, cashflow forecast, recurring detection, and debt scenarios.
- Integration test CSV import, database writes, API responses, auth boundaries, and AI tool calls.
- Test data quality for duplicate detection, missing dates or amounts, currency validation, and category consistency.
- Evaluate AI with golden questions for summaries, affordability, hallucination checks, and approval boundaries.
- Test secrets handling, access control, log redaction, token storage, and dependency security.
- Cover UAT flows for import, categorisation, dashboard review, AI questions, budget creation, and alert review.

## Key Risks

- Sensitive financial data exposure: minimise AI context, encrypt storage, redact logs, and apply least privilege.
- AI hallucination or incorrect advice: ground AI with tools, show calculations, restrict regulated topics, and test prompt behaviour.
- Regulated advice boundary: keep regulated topics educational and signpost qualified professionals.
- Open Banking complexity: start with one provider sandbox and isolate providers behind an adapter.
- Incorrect categorisation: use review workflows, merchant rules, confidence scores, and user overrides.
- Dashboard complexity: prioritise cash today, upcoming bills, budget health, goals, and next action.
- Vendor lock-in: abstract banking providers and AI models behind internal interfaces.
- Cost growth: cache summaries, limit AI context, batch work, and monitor usage.

## Success Measures

- User can understand safe-to-spend and upcoming bills within 30 seconds.
- At least 95% of imported transactions have date, amount, account, and category after review.
- At least 85% of recurring merchants are auto-categorised correctly after rules are created.
- Cashflow projection highlights known low-balance risks at least 7 days ahead.
- AI responses cite dashboard figures and tool outputs rather than inventing values.
- User can explain why the app suggested an action using visible evidence and assumptions.

## MVP Acceptance Criteria

- Upload CSV and see imported transactions assigned to an account.
- Re-import the same CSV without creating duplicate transactions.
- Show current cash, upcoming bills, safe-to-spend, budget health, and goal progress from database values.
- Edit transaction categories and create merchant rules.
- Detect likely recurring payments and show them in bills/subscriptions.
- Ask "What changed this month?" and receive an AI response grounded in retrieved data.
- Ask "Can I afford this?" and receive visible assumptions, calculations, and next action.
- Record AI insight creation, prompt/tool version, and data snapshot reference in audit log.
- Prevent sensitive values from being written to application logs in plain text.
- Export or delete local finance data from settings.
