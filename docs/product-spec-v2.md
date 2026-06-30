# Personal Finance HQ — Product Specification v2

Status: Draft (supersedes the v1 functional/product definition documents)
Owner: Kacper Oblak
Last updated: 2026-06-30

---

## 1. Mission

Personal Finance HQ helps me understand my finances, control spending, escape
overdraft, clear debt, and build savings.

It is, at once:

- a **budgeting app**
- an **overdraft escape tracker**
- a **debt freedom tracker**
- a **savings builder**
- a **mobile-friendly personal finance dashboard** (installable as an iPhone PWA)

## 2. The one question

Every day, the app exists to answer one question:

> **"What can I safely spend today while still getting out of overdraft and
> becoming debt free?"**

Everything in the product — the dashboard, the payday planner, the deterministic
finance engine, the coach — is in service of answering that question honestly and
keeping the answer current.

## 3. Design principles

1. **Free-first.** The default configuration requires no paid service: no OpenAI,
   no live Open Banking, no paid notification provider, no paid database. Firebase
   free tier + Netlify free tier is the baseline.
2. **Works manually without bank sync.** Every feature must be fully usable with
   manually entered data. Bank connections are an accelerator, never a requirement.
3. **Deterministic core.** All money maths (safe-to-spend, payday allocation,
   overdraft projection, debt payoff, savings phases) is computed in code, not by
   an LLM. The numbers are reproducible and auditable.
4. **Privacy by construction.** No provider tokens, Firebase private keys, or raw
   provider payloads ever reach browser code. No real financial data lives in
   tests or seed data. No secrets are committed.
5. **Mobile-first.** Primary surface is an iPhone-sized screen, installable as a
   PWA, usable one-handed.
6. **Mock mode always available.** Development and demos run against deterministic
   mock data with no backend.

## 4. Primary user

A single UK-based individual (GBP) managing a personal financial recovery:
escaping an arranged overdraft, paying down consumer debt, and starting to save —
migrating from a Google Sheets-style tracker into a structured app.

## 5. Feature flags & posture (defaults)

| Capability | Default | Notes |
| --- | --- | --- |
| Backend provider | `firebase` | Firebase Auth + Firestore + Admin |
| Mock data fallback | enabled | development/demo |
| Live Open Banking | disabled | opt-in only |
| TrueLayer sandbox | disabled | first provider to validate |
| Moneyhub sandbox | disabled | deprioritised, may be removed |
| AI money coach (OpenAI) | disabled | deterministic coach always on |
| Web Push | disabled | in-app notifications always on |
| Scheduled alerts | disabled | opt-in, requires cron secret |

## 6. Pages (information architecture)

1. **Dashboard** — the daily answer.
2. **Manual Setup** — wizard to recreate the spreadsheet tracker.
3. **Accounts** — all accounts, purposes, balances, flags.
4. **Payday Planner** — allocate income in priority order.
5. **Overdraft Escape** — track and forecast becoming overdraft-free.
6. **Debt Freedom** — track and forecast becoming debt-free.
7. **Bills Account** — is it funded, what's still to come, what to transfer.
8. **Budgets** — category budgets, spent, remaining, forecast.
9. **Bills & Subscriptions** — recurring outgoings and reviews.
10. **Savings Goals** — pots, targets, phases, contributions.
11. **Transactions** — manual / mock / TrueLayer, with intelligence.
12. **Notifications** — in-app feed and preferences.
13. **AI / Money Coach** — deterministic by default, OpenAI optional.
14. **Settings** — profile, accounts connections, flags.
15. **System Readiness** — environment and configuration health.

### 6.1 Dashboard requirements

The dashboard shows, at a glance:

- Safe to spend
- Bills account status
- Overdraft position
- Total debt
- Monthly debt reduction
- Debt-free forecast
- Savings total
- Upcoming bills before payday
- Subscription total
- Biggest cashflow risk
- Next best action

### 6.2 Manual Setup requirements

A wizard that recreates the old Google Sheets-style tracker. It collects:

- payday date
- monthly income
- accounts
- account purposes
- bills account
- spending account
- savings accounts / pots
- overdraft account
- debts
- money owed to me
- money I owe others
- regular bills
- subscriptions
- monthly budget categories
- preferred safety buffer
- overdraft reduction target
- debt repayment strategy
- savings goals

The wizard stores no real bank credentials and never enables live Open Banking.

### 6.3 Payday Planner

Allocate monthly income in this strict priority order:

1. Bills account
2. Minimum debt payments
3. Overdraft reduction
4. Essential spending
5. Emergency buffer
6. Savings goals
7. Flexible spending

The planner displays each line item plus the final **leftover or shortfall**:

- monthly income
- bills account transfer
- minimum debt payments
- overdraft reduction
- essential spending allocation
- emergency buffer allocation
- savings allocation
- flexible spending
- leftover or shortfall

### 6.4 Bills Account

Answers:

- Is my bills account fully funded?
- What bills still need to come out?
- How much should I transfer on payday?
- Will the bills account go short before payday?

Shows:

- bills account balance
- bills due before payday
- expected shortfall or surplus
- payday transfer required
- bills by payment account

### 6.5 Overdraft Escape

Tracks the journey out of overdraft (see overdraft model, §8.4). Shows current
overdraft used vs limit, target reduction per payday, projected vs target
overdraft-free date, risk before payday, and the recommended payday action.

### 6.6 Debt Freedom

Tracks debts under a chosen strategy (see §8.3). Shows total debt, monthly
reduction, payoff order, and the debt-free forecast date.

### 6.7 Savings Builder

Savings progress through phases (see §9). Shows totals, per-goal progress, and the
current active phase.

## 7. Account model

Accounts support:

- name
- institution
- type
- balance
- available balance
- currency
- purpose
- include in safe-to-spend
- include in cashflow
- include in net worth
- linked savings goal
- overdraft limit (if applicable)
- payment account role

### 7.1 Account purposes

`main current account`, `bills account`, `everyday spending`, `emergency fund`,
`short term savings`, `holiday fund`, `pet fund`, `house deposit`, `credit card`,
`overdraft account`, `loan account`, `pension`, `investment`, `cash`,
`offline account`, `other`.

## 8. Debt & overdraft

### 8.1 Debt model

- name
- balance
- minimum payment
- due date
- APR or cost if known
- priority
- payment account
- status
- notes

### 8.2 Debt strategies

- **snowball** — smallest balance first
- **avalanche** — highest APR/cost first
- **custom** — explicit priority order

### 8.4 Overdraft model

Overdraft plan supports:

- linked account
- overdraft limit
- current overdraft used
- target reduction per payday
- fees / interest if known
- target overdraft-free date
- projected overdraft-free date
- risk before payday
- recommended payday action

## 9. Savings builder phases

1. starter emergency buffer
2. overdraft-free
3. emergency fund
4. debt-free
5. one month essential expenses

Savings goals support:

- name
- target amount
- current amount
- linked account / pot
- monthly contribution
- target date
- priority

## 10. Budgeting

Budgets support:

- category
- monthly budget
- spent
- remaining
- forecast spend
- warning threshold
- linked transactions
- included / excluded flags

## 11. Transactions

Sources: **manual entry**, **mock provider**, **TrueLayer sandbox**, future
**TrueLayer live**.

Each transaction supports:

- account
- date
- description
- merchant
- normalised merchant
- amount
- category
- transfer flag
- excluded-from-spending flag
- reviewed flag
- source
- provider transaction ID (where applicable)

### 11.1 Transaction intelligence (deterministic)

- merchant normalisation
- category assignment
- internal transfer detection
- recurring payment detection
- bill detection
- subscription detection
- price change detection
- anomaly detection
- cashflow forecasting

## 12. Money Coach

OpenAI is optional and **disabled by default**. With OpenAI disabled, the
deterministic coach must still explain:

- why safe-to-spend is high or low
- what to do on payday
- which debt to focus on
- whether the bills account is underfunded
- what changed this month
- what the next best action is

When OpenAI is later enabled, it **must**:

- use server-side API calls only
- send redacted / minimised structured finance context
- never send provider tokens
- never send raw provider payloads
- never send full account numbers
- keep all deterministic calculations in code

It **must not** give regulated investment, mortgage, pension transfer, formal debt
solution, or tax filing advice.

## 13. Notifications

In-app notifications work by default. Types:

- bill due soon
- low safe-to-spend
- bills account shortfall
- debt payment due
- overdraft risk
- subscription price change
- unusual spending
- manual item review
- account connection issue
- payday plan ready

External push (if later enabled) uses privacy-safe copy only, e.g.:

- "Bill due soon"
- "Budget warning"
- "Account connection needs attention"
- "Money review ready"

## 14. Non-goals (for v2)

- Multi-user / shared households.
- Multi-currency beyond GBP.
- Regulated financial advice.
- Required cloud spend of any kind.
- Live Open Banking in the default path.

## 15. Success criteria

- The dashboard answers the §2 question with manually entered data alone.
- A new user can complete Manual Setup and immediately see a payday plan,
  overdraft forecast, and debt-free forecast.
- No secret or token can reach the browser or a committed file.
- The whole app runs on Netlify free + Firebase free with zero paid dependencies.
- TrueLayer sandbox can be enabled and validated without changing the manual path.
