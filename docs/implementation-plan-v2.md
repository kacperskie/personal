# Personal Finance HQ — Implementation Plan v2

Status: Draft
Last updated: 2026-06-30
Companion docs: [`product-spec-v2.md`](./product-spec-v2.md),
[`architecture-v2.md`](./architecture-v2.md)

This plan is **phased**. Each phase has a goal, scope, and exit criteria. No code
is written as part of producing this document — this is the roadmap only.

Guiding rule for every phase: **the manual path must keep working and no secret,
token, or real financial datum may leak to the browser, the repo, or OpenAI.**

---

## Phase A — Audit current repo against this spec

**Goal:** know exactly where the codebase already meets v2 and where it diverges.

### A.1 What already exists (good)

- Firebase backend path: `BACKEND_PROVIDER=firebase`, `src/lib/firebase/*`
  (client, admin, session, env), `/api/auth/firebase-session`.
- Firestore security rules (`firebase/firestore.rules`) — user-scoped, deny by
  default — already match the v2 posture.
- Rich domain model in `src/lib/domain.ts` (Account, Debt, Subscription, Bill,
  SavingsGoal, Budget, Transaction, enrichments, anomalies, notifications, manual
  finance items). Account purposes/roles already include overdraft/bills/spending.
- Deterministic finance engine `src/lib/finance.ts` (safe-to-spend, bills before
  payday, debt summary, budgets, net worth) and `transaction-intelligence.ts`.
- Setup wizard route `src/app/setup/`.
- Bank-provider abstraction with mock + TrueLayer + Moneyhub.
- Deterministic + optional OpenAI coach (`src/lib/ai/*`, `/api/ai/money-coach`).
- In-app notifications, optional web push, scheduled-alert scaffolding.
- System readiness report (`src/lib/deployment/readiness.ts`).
- Netlify config (`netlify.toml`, `netlify/`).

### A.2 Gaps vs v2 (to close in later phases)

1. **Supabase still in the primary path**: deps (`@supabase/ssr`,
   `@supabase/supabase-js`), `src/lib/supabase/*`, Supabase branch in
   `route-auth.ts`, Supabase-led `.env.example`, Supabase checks in readiness.
2. **Missing dedicated pages**: Payday Planner, Overdraft Escape, Debt Freedom,
   Bills Account do not exist as standalone routes. `goals` ≈ Savings Goals,
   `ai-coach` ≈ Money Coach, `bills-and-subscriptions` is combined.
3. **Missing domain types**: no `OverdraftPlan`, no `PaydayPlan`.
4. **Missing engine functions**: payday allocation waterfall, overdraft
   projection, savings-phase calculation, debt strategy ordering/forecast.
5. **Collection naming drift** vs spec (`bankConnections` vs `providerConnections`,
   `aiInsights` vs `moneyCoachInsights`, etc.).
6. **Env defaults**: `.env.example` leads with Supabase and sets
   `OPEN_BANKING_PROVIDER=mock`; v2 wants Firebase-first with TrueLayer optional.
   `FIREBASE_BACKEND_ENABLED` and `NEXT_PUBLIC_FIREBASE_*` storage/sender keys
   present but ordering/emphasis is legacy.
7. **Moneyhub** present but should be deprioritised/removed.
8. **Dashboard** does not yet surface the full v2 metric set (overdraft position,
   monthly debt reduction, debt-free forecast, biggest cashflow risk, next best
   action as first-class tiles).

### A.3 Exit criteria

- A checked gap list (this section) is agreed.
- Each gap is assigned to a later phase (done below).

---

## Phase B — Firebase backend and auth rebase

**Goal:** make Firebase the unambiguous, sole primary backend.

Scope:

- Confirm Firebase Auth + session-cookie flow is the only auth path for `firebase`
  and `mock` backends.
- Ensure every repository read/write routes through the Firebase implementation
  when `BACKEND_PROVIDER=firebase`, with mock fallback when
  `MOCK_DATA_FALLBACK_ENABLED=true`.
- Add v2 domain types `OverdraftPlan` and `PaydayPlan` and their Firestore
  mappers/validation.
- Reconcile subcollection names toward the spec set (introduce spec names; keep
  read aliases during migration). Document any aliases retained.
- Verify Admin credentials are server-only and the browser only ever sees
  `NEXT_PUBLIC_FIREBASE_*`.

Exit criteria:

- App runs end-to-end on Firebase with no Supabase calls in the request path.
- New types persist and round-trip with synthetic data.
- Readiness shows Firebase client + admin configured.

---

## Phase C — Remove Supabase from primary path

**Goal:** Supabase no longer required, then removed entirely if clean.

Scope:

- Remove the `supabase` branch from `route-auth.ts` and any page/data path.
- Delete `src/lib/supabase/*` once no import remains.
- Drop `@supabase/ssr` and `@supabase/supabase-js` from `package.json`.
- Remove Supabase env vars from `.env.example` and required docs.
- Remove Supabase checks from `readiness.ts` (so it can never show as a primary
  failed item); keep backend provider as `firebase | mock` only in
  `src/lib/backend/provider.ts`.
- Decide on the `supabase/` top-level directory (migrations) — archive or delete.

Exit criteria:

- No Supabase import, dependency, env var, or readiness check remains.
- `BACKEND_PROVIDER` accepts only `firebase` and `mock`.
- Build, typecheck, lint, and tests pass.

---

## Phase D — Product reshape around payday, overdraft, debt and savings

**Goal:** the IA and dashboard match the v2 spec.

Scope:

- Add routes: **Payday Planner**, **Overdraft Escape**, **Debt Freedom**,
  **Bills Account**. Rename/realign `goals`→Savings Goals, `ai-coach`→AI / Money
  Coach as needed; keep `bills-and-subscriptions` or split per spec.
- Rebuild the **Dashboard** to surface all required tiles: safe to spend, bills
  account status, overdraft position, total debt, monthly debt reduction,
  debt-free forecast, savings total, upcoming bills before payday, subscription
  total, biggest cashflow risk, next best action.
- Mobile-first layout pass across the new pages.

Exit criteria:

- All 15 spec pages exist and are reachable from navigation.
- Dashboard renders every required metric from deterministic engine output using
  mock data.

---

## Phase E — Manual setup wizard

**Goal:** fully recreate the Google Sheets-style tracker through guided setup.

Scope:

- Extend `/setup` to collect every item in spec §6.2 (payday, income, accounts +
  purposes, bills/spending/savings/overdraft accounts, debts, money owed to/by me,
  bills, subscriptions, budget categories, safety buffer, overdraft reduction
  target, debt strategy, savings goals).
- Persist into the correct Firestore collections + the new `OverdraftPlan` /
  `PaydayPlan` documents.
- No real bank credentials; never enables live Open Banking.

Exit criteria:

- A fresh account can complete setup and immediately get a populated dashboard,
  payday plan, overdraft forecast, and debt-free forecast.

---

## Phase F — Deterministic calculations and coach

**Goal:** the numbers and the explanations, all in code.

Scope:

- Implement in `finance.ts`: payday allocation waterfall (7 steps), overdraft
  projection (projected overdraft-free date + pre-payday risk + recommended
  action), debt payoff ordering for snowball/avalanche/custom + debt-free
  forecast, savings-phase detection, bills-account funding/shortfall/transfer.
- Implement the deterministic coach explanations (spec §12) consuming engine
  output: why safe-to-spend is high/low, payday action, which debt to focus on,
  bills underfunded?, what changed this month, next best action.
- Unit-test all of the above with synthetic data only.

Exit criteria:

- Every dashboard/coach number is produced deterministically and covered by tests.
- OpenAI remains off; coach still answers all required questions.

---

## Phase G — TrueLayer sandbox validation

**Goal:** prove the first real provider end-to-end in sandbox.

Scope:

- Validate OAuth start → callback → account + transaction sync → webhook handling
  against TrueLayer **sandbox** only.
- Confirm tokens are server-only, payloads normalised server-side, and only
  domain data reaches the client.
- Keep `OPEN_BANKING_ENABLED=false` as default; sandbox behind
  `TRUELAYER_SANDBOX_ENABLED`.
- Confirm imported transactions flow through transaction intelligence.

Exit criteria:

- A sandbox connection imports accounts/transactions with no token leakage.
- Manual path is unaffected when the provider is off.

---

## Phase H — iPhone PWA and notification validation

**Goal:** installable, mobile-correct, notifying.

Scope:

- Web app manifest + iOS icons; verify "Add to Home Screen" install.
- Service worker offline app shell.
- Validate all in-app notification types (spec §13).
- Optionally validate Web Push (VAPID, server-side private key, privacy-safe copy)
  behind `WEB_PUSH_ENABLED`.

Exit criteria:

- App installs as an iPhone PWA and works offline for the shell.
- In-app notifications fire for each defined type using synthetic triggers.

---

## Phase I — Staging hardening

**Goal:** safe, observable, repeatable staging on Netlify free tier.

Scope:

- Lock down scheduled routes with `CRON_SECRET`; wire Netlify scheduled functions.
- Verify readiness report is green for the Firebase free path and shows no
  Supabase primary failures.
- Secret-leak checks (readiness serialisation, env hygiene) and final review of
  the §13 security invariants in `architecture-v2.md`.
- Update deployment/security/smoke-test docs to the v2 reality.

Exit criteria:

- Staging deploy on Netlify with Firebase free path, all security invariants hold,
  readiness green, and the §2 question answerable on a freshly set-up account.

---

## Progress log

- **Stage 1 — Finance Engine Foundation (branch `v2-finance-engine-foundation`):**
  Added the deterministic v2 finance engine without touching Supabase, auth, or
  the UI. New domain models (`PaydayPlan`, `PaydayAllocation`, `OverdraftPlan`,
  `DebtStrategy`, `DebtFreedomSummary`, `BillsAccountSummary`, `SavingsPhase`,
  `SavingsPhaseSummary`, `NextBestAction`, plus `OrderedDebt`/risk enums and an
  optional `Debt.priority`). New module `src/lib/finance-v2.ts` implements the
  payday waterfall, overdraft projection, debt strategy ordering + debt-free
  forecast, bills-account funding, savings-phase detection, and next-best-action.
  Added Firestore mappers (`finance-v2-mappers.ts`), a Firebase-backed repository
  with mock fallback (`finance-v2-repository.ts`, plus `paydayPlans`/`overdraftPlans`
  collections), synthetic mock data, and `tests/finance-v2.test.ts`. Mock mode
  still works; OpenAI and live Open Banking remain disabled.

- **Stage 2 — Firebase Primary Backend & Supabase Removal (branch
  `v2-finance-engine-foundation`):** Reduced the backend provider union to
  `firebase | mock` (`BACKEND_PROVIDER=supabase` now degrades to mock). Removed
  Supabase from the primary path: middleware, route-auth, sign-in page/action,
  and profile init are Firebase/mock only; deleted the Supabase sign-in form,
  the Supabase-only `/auth/callback` route, and `profiles.ts`. System readiness
  no longer shows Supabase checks (added Firestore readiness + mock fallback
  status). `.env.example` and all deployment/security docs are Firebase-first.
  Tests rewritten (phase11/12b/12c) plus a new `phase13-firebase-primary` suite.
  **Deferred (low risk):** the large data-repository Supabase branches and
  `src/lib/supabase/*` remain as inert, env-gated dead code (the Supabase env
  helpers are hard-disabled to return null, so mock fallback is always taken off
  the Firebase path); `@supabase/*` deps and `supabase/migrations/*` stay as
  archived references for a later deletion stage.

## Cross-cutting checklist (applies to every phase)

- [ ] Manual (no-sync) path still works.
- [ ] Mock mode still works.
- [ ] No secrets committed.
- [ ] No tokens / private keys / raw payloads to the browser.
- [ ] No real financial data in tests or seeds.
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` pass.
