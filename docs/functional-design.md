# Functional Design

Source: `Personal_Finance_Dashboard_Functional_Design_Document.docx`. Prepared 30 June 2026, version 0.1 draft.

## Design Overview

The application is a web-based personal finance dashboard with an embedded AI money coach. It is optimised for a single primary UK user and emphasises clarity, control, explainability, and privacy.

The dashboard should reduce financial uncertainty by showing the current position, upcoming commitments, important changes, and one practical next action.

## Product Principles

- Show the answer first: cash today, bills pending, safe-to-spend, and risks should be visible immediately.
- Explain every number: dashboard figures should drill into transactions, bills, and assumptions.
- Prefer calm prompts: warnings should be practical and proportionate.
- Keep the user in control: AI proposes, the user confirms budgets, rules, external actions, and provider communications.
- Design for messy data: handle duplicate merchants, pending transactions, transfers, refunds, and CSV variation.
- Make progress visible: goals, debt reduction, and budget recovery should show progress and next steps.
- Respect regulated boundaries: investment, pension, mortgage, debt-solution, and tax topics stay educational and signposted.

## Users

- Primary user: wants a practical command centre for day-to-day finances, subscriptions, savings, and planned purchases.
- Future household user: may need shared bills, shared goals, private accounts, permissions, and household views.
- Builder/developer: needs clean schema, typed APIs, test fixtures, and clear business rules.
- Security reviewer: needs auditable flows, redacted logs, encryption, and approval controls.

## Information Architecture

- Dashboard
- Transactions
- Budgets
- Cashflow
- Bills & Subscriptions
- Goals / Pots
- Debt Planner
- Net Worth
- AI Money Coach
- Alerts
- Settings

The AI Money Coach should also appear as a contextual side panel on major pages.

## Key User Journeys

### First Setup
- User chooses manual CSV setup.
- User creates one or more accounts, such as current account, credit card, and savings.
- User uploads CSV transactions and maps columns where required.
- System normalises transactions and asks for category review.
- User sets payday, core bills, minimum buffer, and first savings goal.
- Dashboard creates the first monthly position and AI summary.

### Weekly Review
- User opens Dashboard and sees current cash, safe-to-spend, and budget health.
- User reviews alerts for high spending, upcoming bills, or subscription changes.
- User asks the AI coach what changed this week.
- AI returns a summary with evidence, assumptions, and suggested next action.
- User accepts, dismisses, or saves suggested actions.

### Affordability
- User asks whether a planned purchase is affordable.
- System retrieves current cash, bills, budgets, goals, payday, and buffer.
- Calculation engine produces safe-to-spend and future cashflow impact.
- AI explains options such as buy now, delay, save over time, or reduce selected categories.
- User saves the scenario or converts it into a goal.

## Screens

### Dashboard
- Prioritise current financial position over detailed analytics.
- Show cash today, safe-to-spend, bills before payday, risk level, budget health, upcoming bills, savings goals, and AI summary.
- Safe-to-spend equals available cash minus known bills before payday, savings commitments, debt commitments, and minimum buffer.
- Risk level is Low, Medium, or High based on projected low balance, overspending pace, and upcoming commitments.

### Transactions
- Table with date, account, merchant, description, amount, category, flags, and review status.
- Filters for date range, account, category, merchant, amount range, reviewed/unreviewed, and recurring.
- Inline category and notes editing.
- Merchant rule creation and bulk actions.

### Budgets
- Category cards show budget, spent, remaining, pace, forecast, and AI note.
- Monthly budget period by default.
- Over-budget handling shows projected overspend and suggested adjustment from flexible categories.
- Transfers and refunds are excluded or separately classified.

### Cashflow
- Project daily balance from current balances, upcoming bills, expected income, planned savings, and known debt payments.

### Bills And Subscriptions
- Group recurring payments by bill, subscription, debt repayment, savings transfer, income, or unknown recurring payment.
- Flag price changes, renewals, duplicate payments, and unconfirmed recurring payments.

### Goals / Pots
- Capture name, target amount, current amount, target date, priority, and funding source.
- Calculate monthly or payday contribution required.
- Allow affordability scenarios to become goals.
- Show progress, target date, required contribution, and AI note.

### AI Money Coach
- Provide conversational analysis over controlled backend tools.
- Responses should include answer, calculation/evidence, assumptions, risks, and practical next action.

## Calculations And Rules

### Safe-To-Spend

```text
safe_to_spend =
  available_cash
  - upcoming_bills_before_payday
  - planned_savings_before_payday
  - debt_payments_before_payday
  - minimum_buffer
  - reserved_goal_contributions
  +/- confirmed_adjustments
```

- Available cash should be configurable by account type.
- Credit-card balances should appear as liabilities and payment commitments.
- Pending transactions are included or excluded based on account/provider reliability setting.
- Transfers between own accounts should not double-count income or expense.

### Budget Pace

```text
expected_spend_to_date = monthly_budget * elapsed_budget_period_ratio
budget_pace = actual_spend_to_date / expected_spend_to_date
```

- `<= 0.90`: under pace
- `0.91-1.10`: on pace
- `1.11-1.30`: high
- `> 1.30`: risk

### Recurring Payment Detection
- Same or similar merchant appearing monthly, weekly, or annually.
- Amount within tolerance band, for example exact or +/- 10%.
- Date variance tolerance, for example +/- 5 days for monthly payments.
- User confirmation before a payment becomes an official bill or subscription.

## AI Coach Capabilities

- Monthly review: income, spending by category, changes, risks, and next action.
- Weekly check-in: budget pace, upcoming bills, and short-term safe-to-spend.
- Affordability: backend calculation with explained options.
- Category explanation: transaction evidence for high categories.
- Subscription review: rank by cost, change, and review value.
- Payday plan: bills, goals, debt, flexible categories, and buffer allocation.
- Debt explanation: scenarios and signposting where appropriate.
- Regulated-topic guardrail: education and qualified-support signposting for investments, pensions, mortgages, and formal debt solutions.

## AI Tools

- `get_cash_position`
- `get_budget_status`
- `get_upcoming_bills`
- `get_transactions`
- `run_affordability_scenario`
- `detect_anomalies`
- `save_insight`
- `create_proposed_rule`

## Alerts

- Low balance risk.
- Bill increase.
- Duplicate payment.
- High budget pace.
- Subscription review.
- Goal at risk.
- Uncategorised transactions.

## Functional Requirements

- Create and manage financial accounts.
- Import transaction CSV files with configurable column mapping.
- Deduplicate imported transactions deterministically.
- Review and edit transaction categories.
- Create merchant rules.
- Calculate monthly spend by category.
- Calculate safe-to-spend.
- Detect likely recurring payments.
- Show upcoming bills.
- Manage monthly budgets.
- Calculate budget pace and projected overspend.
- Manage savings goals.
- Run affordability scenarios.
- Provide grounded AI weekly and monthly reviews.
- Show AI evidence and assumptions.
- Require confirmation before creating persistent rules from AI suggestions.
- Store insight history and audit metadata.
- Export and delete data.
- Support future Open Banking sync behind a provider adapter.

## Accessibility And Content

- Use readable contrast, clear headings, and keyboard-accessible controls.
- Do not rely on colour alone for status or alerts.
- Use plain English and inline explanations.
- Provide aria labels for charts and tabular alternatives for key chart data.
- Use calm wording.
- Support responsive desktop, tablet, and mobile PWA layouts.

## Error And Empty States

- No transactions imported: setup checklist and sample dashboard preview.
- Unknown CSV format: column mapping and saved mapping.
- Duplicate import: duplicate count, skipped rows, and import history.
- Uncategorised transactions: review queue and confidence indicator.
- AI missing data: state missing data and provide closest safe calculation.
- Open Banking consent expired: reconnect prompt and timestamped last-known data.
- Provider outage: sync status and manual import fallback.
- Low confidence insight: mark assumptions and avoid strong recommendation language.

## UAT Scenarios

- Import current account CSV.
- Re-import the same CSV without duplicates.
- Categorise a merchant and optionally create a rule.
- Create a monthly budget.
- Detect a subscription.
- Ask for monthly review.
- Run an affordability scenario.
- Trigger low-balance risk.
- Delete data.
- Prompt a regulated topic and receive educational guidance with signposting.
