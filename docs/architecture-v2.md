# Personal Finance HQ — Architecture v2

Status: Draft (supersedes the v1 technical architecture document)
Last updated: 2026-06-30
Companion docs: [`product-spec-v2.md`](./product-spec-v2.md),
[`implementation-plan-v2.md`](./implementation-plan-v2.md)

---

## 1. Architecture goals

- **Netlify** is the primary host.
- **Firebase** is the primary backend (Auth + Firestore + Admin SDK).
- The app is an installable **iPhone PWA**.
- **TrueLayer sandbox** is the first bank API to validate; live Open Banking stays
  disabled by default.
- **OpenAI** is optional and disabled by default.
- The app works **fully manually** without bank sync; **mock mode** stays available.
- **Supabase is removed from the primary user-facing path**, and may be removed
  entirely once Firebase fully replaces its functionality.

## 2. High-level topology

```
            ┌──────────────────────────────────────────────┐
            │                iPhone PWA / Browser           │
            │  Next.js App Router (RSC + client components)  │
            │  Firebase Web SDK (Auth only, public config)   │
            │  Service worker (offline shell + push later)   │
            └───────────────┬───────────────────────────────┘
                            │  HTTPS (session cookie)
            ┌───────────────▼───────────────────────────────┐
            │            Netlify (primary host)              │
            │  Next.js server runtime (RSC, route handlers)  │
            │  Netlify scheduled functions → protected routes│
            └───────────────┬───────────────────────────────┘
                            │  Firebase Admin SDK (server only)
            ┌───────────────▼───────────────────────────────┐
            │                  Firebase                      │
            │  Auth (identity)   Firestore (finance data)    │
            │  Security rules (user-scoped, deny by default) │
            └────────────────────────────────────────────────┘

  Optional / disabled by default:
    TrueLayer sandbox (server-side OAuth + sync)
    OpenAI (server-side, redacted context)
    Web Push (VAPID, server-side private key)
```

## 3. Hosting & runtime — Netlify

- Next.js (App Router) deployed on Netlify as the primary target. `vercel.json`
  remains only as a secondary/optional convenience.
- Server work (route handlers, RSC data loads, Admin SDK calls) runs in the
  Netlify Next.js runtime.
- Scheduled work uses **Netlify scheduled functions** that call internal protected
  API routes guarded by `CRON_SECRET` (no business logic in the scheduler itself).
- `APP_BASE_URL` drives redirect/callback/webhook URL construction.

## 4. Backend — Firebase

### 4.1 Auth

- **Firebase Auth** (email/password) is the identity provider.
- The browser receives only the **public** Firebase web config (`NEXT_PUBLIC_*`).
- After client sign-in, the Firebase ID token is exchanged at
  `/api/auth/firebase-session` for an **HTTP-only session cookie**. Server code
  verifies the cookie via the Admin SDK before any data access.
- The Netlify domain must be added to Firebase Auth authorized domains.

### 4.2 Firestore data model

All user-owned data lives under the authenticated user document. Logical
collections from the spec map to subcollections of `users/{userId}`:

```
users/{userId}
users/{userId}/accounts/{accountId}
users/{userId}/manualFinanceItems/{itemId}
users/{userId}/transactions/{transactionId}
users/{userId}/budgets/{budgetId}
users/{userId}/bills/{billId}
users/{userId}/subscriptions/{subscriptionId}
users/{userId}/savingsGoals/{goalId}
users/{userId}/debts/{debtId}
users/{userId}/overdraftPlans/{planId}
users/{userId}/paydayPlans/{planId}
users/{userId}/notificationPreferences/{preferenceId}
users/{userId}/appNotifications/{notificationId}
users/{userId}/moneyCoachInsights/{insightId}
users/{userId}/auditLog/{auditEventId}
users/{userId}/providerConnections/{connectionId}
users/{userId}/providerSyncEvents/{eventId}
users/{userId}/transactionEnrichments/{enrichmentId}
users/{userId}/detectedBills/{detectedBillId}
users/{userId}/detectedSubscriptions/{detectedSubscriptionId}
users/{userId}/spendingAnomalies/{anomalyId}
users/{userId}/cashflowEvents/{eventId}
```

> Naming note: the current code already uses several near-equivalent
> subcollections (`bankConnections`, `aiInsights`, `recurringPaymentCandidates`,
> `budgetPeriods`, `categories`, `merchantRules`, `pushSubscriptions`,
> `notificationDeliveryAttempts`). Phase B reconciles these against the spec names
> (`providerConnections`, `moneyCoachInsights`, …). Renames are a migration, not a
> hard requirement of v2 — the spec names are the target, aliases are acceptable
> during transition and tracked in the implementation plan.

New domain types required by v2 that are not yet first-class in `src/lib/domain.ts`:

- **`OverdraftPlan`** — linked account, overdraft limit, current overdraft used,
  target reduction per payday, fees/interest, target & projected overdraft-free
  dates, pre-payday risk, recommended action.
- **`PaydayPlan`** — income, the seven ordered allocations (§6.3 of the spec), and
  leftover/shortfall, with the payday date it applies to.
- **Account additions** — explicit `overdraftLimit` semantics surfaced in the UI
  (the type already carries `creditLimit`/role flags) and a clear
  `overdraft_account` purpose (already present in `AccountPurpose`).

### 4.3 Firebase Admin (server only)

- Admin credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
  `FIREBASE_PRIVATE_KEY`) are server-only and never bundled to the browser.
- Used for session-cookie verification, server-side Firestore reads/writes, and
  scheduled-job data access.

### 4.4 Security rules

`firebase/firestore.rules` already enforces the v2 posture:

- A signed-in user may read/write only `users/{auth.uid}` and everything beneath
  it; all other paths deny by default.
- Provider tokens are **never** stored in client-readable collections (held in a
  server-only store / secret manager, keyed by connection).
- Push subscriptions are user-scoped and never rendered in UI or logs.
- Audit log entries are treated as append-only where practical.

## 5. Backend provider abstraction

`src/lib/backend/provider.ts` selects the backend from `BACKEND_PROVIDER`:

- `firebase` (default / primary)
- `mock` (development & demo, no backend)
- `supabase` (legacy — to be removed; see Phase C)

The repository layer (`src/lib/repositories/*`) is the single seam between pages
and storage:

- `finance-repository.ts` / `service-finance-repository.ts` — request-scoped and
  service-scoped reads/writes.
- `firebase-repository.ts` — Firestore implementation.
- `mappers.ts`, `validation.ts` — translate domain types ↔ stored documents and
  validate input.

Target end-state: the abstraction supports exactly **`firebase`** and **`mock`**.
The `supabase` branch and `src/lib/supabase/*` are deleted once parity is proven.

## 6. Deterministic finance engine

`src/lib/finance.ts` is the deterministic core and must remain pure and
test-covered. v2 extends it to own:

- **Safe-to-spend** (exists) — eligible cash minus committed outflows before payday
  and buffer.
- **Payday allocation** (new) — the seven-step waterfall in priority order.
- **Overdraft projection** (new) — used vs limit, reduction per payday, projected
  overdraft-free date, pre-payday risk.
- **Debt payoff** (extend `calculateDebtSummary`) — snowball / avalanche / custom
  ordering and debt-free forecast date.
- **Savings phases** (new) — which of the five phases is active and progress to the
  next.
- **Bills-account funding** (extend existing bills helpers) — funded?, shortfall,
  required payday transfer.

All of the above are inputs to both the dashboard and the deterministic coach. No
LLM is involved in producing any number.

`src/lib/transaction-intelligence.ts` owns the deterministic transaction
intelligence (merchant normalisation, categorisation, transfer/recurring/bill/
subscription detection, price-change and anomaly detection, cashflow forecasting).

## 7. Bank providers (optional, disabled by default)

`src/lib/bank-providers/*` already abstracts providers behind a common interface
(`mock`, `moneyhub`, `truelayer`).

v2 direction:

- **Mock provider** is the default and always available.
- **TrueLayer sandbox** is the first real provider to validate end-to-end (OAuth
  start → callback → account/transaction sync → webhooks).
- **Live Open Banking** stays gated behind `OPEN_BANKING_ENABLED=false`.
- **Moneyhub** is deprioritised; it may be removed if it adds maintenance cost
  without near-term use.

Security invariants for providers:

- OAuth and token exchange happen **server-side only**.
- Access/refresh tokens live in a server-only token store, never in
  client-readable Firestore collections, never serialised to the browser.
- Raw provider payloads are normalised server-side via `provider-mappers.ts`;
  only normalised domain data reaches the client.

## 8. AI / Money Coach

`src/lib/ai/*` separates the two modes:

- **Deterministic coach** — default; consumes finance-engine outputs and produces
  the explanations listed in spec §12. No network calls.
- **OpenAI mode** — opt-in (`AI_MONEY_COACH_ENABLED` + `OPENAI_API_KEY`),
  server-side only (`/api/ai/money-coach`). `context-builder.ts` + `redaction.ts`
  build a **minimised, redacted** structured context; `guardrails.ts` enforces the
  prohibited-advice boundaries. No tokens, raw payloads, or full account numbers
  are ever sent.

## 9. Notifications

- **In-app** notifications are always on, stored under `appNotifications`, surfaced
  on the Notifications page.
- **Web Push** is optional (`WEB_PUSH_ENABLED`), uses VAPID keys with the private
  key server-side only, and uses privacy-safe copy.
- **Scheduled alerts** are optional (`SCHEDULED_ALERTS_ENABLED`) and driven by
  Netlify scheduled functions hitting `CRON_SECRET`-protected routes.

## 10. PWA

- Web app manifest + icons for iPhone install.
- Service worker provides an offline app shell and (later) push handling.
- Mobile-first layout in `src/components/app-shell.tsx` and page components.

## 11. System readiness

`src/lib/deployment/readiness.ts` produces the readiness report. v2 target items:

- Deployment platform: **Netlify**
- Backend provider: **Firebase** or **Mock**
- Firebase client configured
- Firebase admin configured
- Firestore available
- Mock fallback status
- TrueLayer sandbox status
- OpenAI disabled/enabled
- Web Push disabled/enabled
- Scheduled jobs disabled/enabled
- App base URL configured
- Cron secret configured

Readiness must **not** present Supabase as a primary failed item. Until Supabase is
fully removed, its checks are suppressed/neutral when `BACKEND_PROVIDER` is not
`supabase` (current behaviour already returns `pass`/neutral in that case; Phase C
removes the checks outright).

## 12. Environment variables

### 12.1 Required (Firebase free path)

```
BACKEND_PROVIDER=firebase
FIREBASE_BACKEND_ENABLED=true
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
APP_BASE_URL
CRON_SECRET
```

### 12.2 Optional (all default off)

```
OPEN_BANKING_PROVIDER=truelayer
OPEN_BANKING_ENABLED
TRUELAYER_SANDBOX_ENABLED
TRUELAYER_CLIENT_ID
TRUELAYER_CLIENT_SECRET
TRUELAYER_REDIRECT_URI
TRUELAYER_API_BASE_URL
TRUELAYER_AUTH_BASE_URL
TRUELAYER_SCOPES
AI_MONEY_COACH_ENABLED
OPENAI_API_KEY
WEB_PUSH_ENABLED
WEB_PUSH_VAPID_PUBLIC_KEY
WEB_PUSH_VAPID_PRIVATE_KEY
SCHEDULED_ALERTS_ENABLED
```

### 12.3 Default feature flags

```
BACKEND_PROVIDER=firebase
MOCK_DATA_FALLBACK_ENABLED=true
OPEN_BANKING_ENABLED=false
AI_MONEY_COACH_ENABLED=false
WEB_PUSH_ENABLED=false
SCHEDULED_ALERTS_ENABLED=false
TRUELAYER_SANDBOX_ENABLED=false
MONEYHUB_SANDBOX_ENABLED=false
```

### 12.4 To be retired

Supabase and Moneyhub variables (`NEXT_PUBLIC_SUPABASE_*`,
`SUPABASE_SERVICE_ROLE_KEY`, `MONEYHUB_*`) leave the required set. Supabase vars are
removed entirely in Phase C; Moneyhub vars become legacy/optional and may be
removed.

## 13. Security invariants (must always hold)

1. No secrets committed to the repo.
2. No provider tokens exposed to browser code.
3. No Firebase private key exposed to browser code.
4. No raw provider payloads sent to the browser or to OpenAI.
5. No full account numbers sent to OpenAI.
6. No real financial data in tests or seed/mock data.
7. Firestore denies everything outside the signed-in user's tree.
8. All deterministic finance maths stays in code, not in an LLM.

## 14. Testing strategy

- **Unit**: deterministic finance engine and transaction intelligence (pure
  functions, synthetic data only) — Vitest.
- **Component**: page-level rendering against mock data (e.g. `tests/*.test.tsx`).
- **Integration (manual/sandbox)**: TrueLayer sandbox flow validated against
  sandbox credentials, never production.
- All fixtures use clearly fake, non-real financial data.
