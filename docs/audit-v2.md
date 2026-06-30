# Personal Finance HQ — v2 Audit Report

Status: Audit (no code changed)
Date: 2026-06-30
Auditor scope: repo state on branch `main`
Companion docs: [`product-spec-v2.md`](./product-spec-v2.md),
[`architecture-v2.md`](./architecture-v2.md),
[`implementation-plan-v2.md`](./implementation-plan-v2.md)

This report audits the current repository against the v2 specification. It changes
no application code, deletes nothing, adds no dependencies, and prints no secrets.
All findings are derived from the repo contents.

---

## 1. Current architecture summary

| Concern | Current state |
| --- | --- |
| **Hosting** | Netlify is primary: `netlify.toml` uses `@netlify/plugin-nextjs`, `publish=.next`, `netlify/functions` for scheduled work. Vercel is a secondary fallback via `vercel.json` (two cron entries). |
| **Backend** | Tri-modal. `BACKEND_PROVIDER` selects `firebase \| supabase \| mock` (`src/lib/backend/provider.ts`). Firebase and Supabase paths are both implemented; mock fallback is gated by `MOCK_DATA_FALLBACK_ENABLED`. |
| **Authentication** | Firebase Auth path: `firebase-sign-in-form.tsx`, `/api/auth/firebase-session`, HTTP-only session cookie verified via Admin `verifySessionCookie` (`src/lib/firebase/session.ts`). Supabase path: `signInWithPassword` + magic link (`sign-in/actions.ts`), `/auth/callback` exchange. `middleware.ts` enforces both (Firebase cookie check or Supabase SSR `getUser`). |
| **Database / persistence** | Firestore via `firebase-repository.ts` (`users/{uid}/{collection}` subcollections) **or** Supabase Postgres via `from(...).select/insert` in `finance-repository.ts`, `service-finance-repository.ts`, `notification-repository.ts`. Repositories branch on `isFirebaseBackend()` and otherwise fall through to Supabase. Mock data from `src/lib/mock-data.ts`. |
| **Provider integration** | `src/lib/bank-providers/*` abstracts `mock`, `moneyhub`, `truelayer`. OAuth start/callback, sync workflow, webhooks (Moneyhub + TrueLayer), token store, sync queue, payload inspection. Disabled by default. |
| **Notifications** | In-app notifications (`appNotifications`), optional Web Push (VAPID, `src/lib/notifications/web-push.ts`), scheduled alerts via `netlify/functions/scheduled-notifications.ts` → protected API route. |
| **AI / money coach** | Deterministic fallback (`src/lib/ai/money-coach.ts`) plus optional OpenAI (`/api/ai/money-coach`) with redaction (`redaction.ts`) and guardrails (`guardrails.ts`). Disabled by default. |
| **PWA** | `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`, `public/icons/`. |
| **Deployment readiness** | `src/lib/deployment/readiness.ts` builds a multi-check report; `src/lib/deployment/env.ts` validates env + feature flags and detects platform. Secret-leak guard `assertNoSecretValuesInReadinessReport`. |

**Net:** the repo is a mature dual-backend (Firebase + Supabase) app with Firebase
already wired as a first-class path. v2 is mostly a **subtraction (Supabase) + product
reshape**, not a greenfield rebuild.

---

## 2. Gap analysis against v2 architecture

| Target | Status | Evidence / note |
| --- | --- | --- |
| Netlify primary host | **complete** | `netlify.toml`, `@netlify/plugin-nextjs`, scheduled functions present. |
| Firebase primary backend | **partial** | Firebase path fully implemented but co-equal with Supabase; default selection logic still falls back to Supabase if its env is present. Should become the sole primary. |
| Firebase Auth | **complete** | Sign-in form, session-cookie route, middleware cookie check all present. |
| Firestore persistence | **partial** | `firebase-repository.ts` covers core collections; some spec collections are not yet first-class (`overdraftPlans`, `paydayPlans`), and naming differs (`bankConnections`, `aiInsights`). |
| Firebase Admin server-side | **complete** | `src/lib/firebase/admin.ts` (`cert`, server-only), used for session verify + service Firestore. |
| Mock mode | **complete / should keep** | `getBackendProvider` → `mock`; repositories return mock data; middleware no-ops in mock. |
| TrueLayer sandbox optional | **complete** | Provider, webhooks, readiness checks, `phase12a` test exist; off by default. |
| OpenAI optional | **complete** | Off by default; deterministic fallback always available. |
| Supabase removed from primary path | **conflicting / should remove** | Supabase is still load-bearing in auth, repositories, middleware, readiness, env, migrations, docs. This is the central v2 gap. |

Per-area verdicts:

- **Keep:** Netlify host, Firebase Auth, Firebase Admin, mock mode, TrueLayer (optional),
  OpenAI (optional), deterministic finance engine, transaction intelligence, PWA assets.
- **Complete the rebase:** make Firebase the sole non-mock backend.
- **Should remove:** Supabase from every primary code path (see §3).
- **Add:** `OverdraftPlan` / `PaydayPlan` types + collections, and the four missing pages.

---

## 3. Supabase dependency audit

Grep for `supabase|Supabase|SUPABASE` matched 57 files. Classified by load-bearing area:

### Source code (live Supabase usage)

| File | Usage | Classification |
| --- | --- | --- |
| `src/lib/supabase/server.ts` | SSR server client | **replace with Firebase** (delete after parity) |
| `src/lib/supabase/browser.ts` | browser client | **remove** |
| `src/lib/supabase/admin.ts` | service-role client | **replace with Firebase Admin** |
| `src/lib/supabase/env.ts` | `isSupabaseConfigured` | **remove** |
| `src/lib/supabase/database.types.ts` | Postgres types | **remove** |
| `middleware.ts` | Supabase SSR branch | **replace with Firebase** (keep Firebase + mock branches) |
| `src/lib/server/route-auth.ts` | Supabase `getUser` fallback | **replace with Firebase** (delete Supabase branch) |
| `src/lib/repositories/finance-repository.ts` | Supabase reads/writes after `isFirebaseBackend()` guard | **replace with Firebase** (remove Supabase fallthrough) |
| `src/lib/repositories/service-finance-repository.ts` | service-role Postgres queries | **replace with Firebase Admin** |
| `src/lib/repositories/notification-repository.ts` | Supabase context + queries | **replace with Firebase** |
| `src/lib/repositories/profiles.ts` | wholly Supabase (`User` type, upsert) | **replace with Firebase** (Firebase has `ensureFirebaseUserProfile`) |
| `src/lib/repositories/mappers.ts`, `audit.ts` | Supabase row mapping/audit | **replace with Firebase** (Firebase audit path exists) |

### API / auth routes

| File | Classification |
| --- | --- |
| `src/app/auth/callback/route.ts` (Supabase code exchange) | **remove** (Supabase-only) |
| `src/app/sign-in/actions.ts` (Supabase sign-in/magic link) | **replace with Firebase** (keep `signOutAction` Firebase branch) |
| `src/app/sign-in/page.tsx`, `sign-in-form.tsx` | **replace with Firebase** (Firebase form already exists) |

### Readiness / config

| File | Classification |
| --- | --- |
| `src/lib/deployment/readiness.ts` (`supabase_url`, `supabase_anon_key`, `supabase_service_role` checks) | **remove** (so it can never be a primary failed item) |
| `src/lib/deployment/env.ts` (Supabase validation) | **remove** |
| `src/lib/backend/provider.ts` (`supabase` in union + fallback) | **remove** (reduce to `firebase \| mock`) |

### Docs

| File | Classification |
| --- | --- |
| `README.md`, `AGENTS.md`, `docs/firebase-schema.md`, `docs/deployment-checklist.md`, `docs/netlify-deployment.md`, `docs/security-checklist.md`, `docs/staging-smoke-test.md`, `docs/technical-architecture.md` | **docs archive only** (update to Firebase-first; keep Supabase notes only as historical) |

### Tests

| File | Classification |
| --- | --- |
| `tests/phase12c.test.tsx` (asserts `supabase` selection), `tests/phase11.test.tsx`, `tests/phase12b.test.ts` | **rewrite for Firebase** (drop Supabase assertions) |

### Environment

| File | Classification |
| --- | --- |
| `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) | **remove from required**; remove entirely in Phase C |
| `netlify.toml` comment block referencing Supabase vars | **docs archive only** (update comment) |

### Migrations

| Path | Classification |
| --- | --- |
| `supabase/migrations/*.sql` (7 files) | **docs archive only** (archive or delete; not used by Firebase path) |

**Conclusion:** Supabase is removable. Firebase equivalents already exist for auth,
sessions, profiles, audit, and the core repository surface. The work is to delete the
Supabase branches/fallthroughs and prove Firestore parity, not to build new backend code.

---

## 4. Firebase readiness audit

| Capability | Present? | Evidence |
| --- | --- | --- |
| Firebase client setup | ✅ | `src/lib/firebase/client.ts`, `env.ts` (`getFirebaseBrowserEnv`), public config only |
| Firebase Admin setup | ✅ | `src/lib/firebase/admin.ts` (`cert`, `getApps`), server-only |
| Firebase Auth path | ✅ | `firebase-sign-in-form.tsx`, `/api/auth/firebase-session`, session cookie |
| Firestore repository layer | ✅ (partial) | `firebase-repository.ts` (get/upsert/delete/collection helpers, profiles, audit) |
| Firestore rules | ✅ | `firebase/firestore.rules` — user-scoped, deny by default |
| Firebase readiness checks | ✅ | `readiness.ts` (`firebase_client`, `firebase_admin`) |
| Firebase env documentation | ✅ (partial) | `docs/firebase-schema.md`, `.env.example` has all `NEXT_PUBLIC_FIREBASE_*` + admin vars |
| Firebase tests | ✅ (partial) | `tests/phase12c.test.tsx` (env validation, backend selection) |

**Missing for v2:**

- First-class `overdraftPlans` and `paydayPlans` collections + mappers.
- A dedicated "Firestore available" runtime readiness check (current checks are
  config-presence, not connectivity).
- Firebase-only repository tests (current Firebase test is env/selection level only;
  no CRUD round-trip test with an emulator/mock Firestore).
- Spec-aligned collection names (`providerConnections`, `moneyCoachInsights`).

---

## 5. Product workflow audit

| Workflow | Status | Note |
| --- | --- | --- |
| Safe-to-spend | **good** | `calculateSafeToSpend*` in `finance.ts`; surfaced on dashboard. |
| Payday planning | **missing** | No 7-step allocation waterfall, no `/payday-planner`, no `PaydayPlan` type. |
| Overdraft escape | **missing** | Account purpose `overdraft_account` exists, but no `OverdraftPlan`, no projection, no page. |
| Debt freedom | **partial** | `calculateDebtSummary` exists; no snowball/avalanche/custom ordering, no debt-free forecast date, no `/debt-freedom`. |
| Bills account funding | **partial** | `calculateBillsAccountBalance`, `calculateBillsDueBeforePayday` exist; no funded?/shortfall/transfer page (`/bills-account`). |
| Savings builder | **partial** | `SavingsGoal` + progress calc exist; no 5-phase model, no phase detection. |
| Manual setup wizard | **partial** | `/setup` exists; needs to cover the full spec §6.2 field set incl. overdraft target, debt strategy, buffer. |
| Subscriptions review | **good** | `Subscription` model, detection, `bills-and-subscriptions` page. |
| Transaction intelligence | **good** | `transaction-intelligence.ts` covers normalisation, transfer/recurring/bill/subscription/anomaly/cashflow. |
| Deterministic coach fallback | **good** | `buildDeterministicMoneyCoachFallback` present and tested (`phase9`). |
| Next best action | **partial / needs redesign** | Coach produces suggestions; no single deterministic "next best action" surfaced as a dashboard primitive. |

---

## 6. Data model audit (`src/lib/domain.ts`)

| Model | Verdict | Change needed for v2 |
| --- | --- | --- |
| Accounts | keep, extend | Surface `overdraftLimit` semantics explicitly (type has `creditLimit` + role flags); confirm `availableBalance`, include-flags, `linkedGoalIds` map to spec. |
| Account purposes | keep | `AccountPurpose` already includes all spec purposes incl. `overdraft_account`. No change. |
| Debts | keep, extend | Add explicit `priority` + `strategy`-relevant fields; spec wants priority for custom ordering. `apr`, `minimumPayment`, `dueDate`, `accountId` exist. |
| Overdraft plan | **add** | No `OverdraftPlan` type. Add: linked account, limit, used, target reduction/payday, fees, target & projected dates, pre-payday risk, recommended action. |
| Payday plan | **add** | No `PaydayPlan` type. Add: income + 7 ordered allocations + leftover/shortfall + payday date. |
| Bills | keep | `Bill` model adequate; ensure `accountId` (payment account) populated for "bills by payment account". |
| Subscriptions | keep | `Subscription` adequate (`reviewDate`, price-change via `DetectedSubscription`). |
| Budgets | keep | `Budget` + `BudgetPeriod` adequate; forecast/threshold computed in engine. |
| Savings goals | keep, extend | Add savings **phase** concept (engine-level, not necessarily per-goal field). |
| Manual finance items | keep | `ManualFinanceItem` covers debt/owed-to/owed-by/offline/cash. Adequate. |
| Transactions | keep | `Transaction` + `TransactionEnrichment` cover all spec fields (normalised merchant, transfer/excluded/reviewed flags, source, provider id). |
| Notifications | keep | `NotificationType` is a superset of spec types; `privacySafeTitle/Body` present. |
| Money coach insights | keep, rename | `AIInsight` exists; spec collection is `moneyCoachInsights` (alias/rename). |
| Audit log | keep | `auditLog` collection + Firebase audit writer exist. |
| Provider connections | keep, rename | `BankConnection` + `bankConnections`; spec name is `providerConnections` (alias/rename). |

---

## 7. Route / page audit

Current routes (from `src/app/**/page.tsx` + route handlers):

| Current route | Verdict | Action |
| --- | --- | --- |
| `/` (`page.tsx`) | **redesign** | Rebuild dashboard to surface all 11 spec tiles. |
| `/setup` | **redesign** | Extend wizard to full spec §6.2. |
| `/accounts` | **keep** (minor redesign) | Add overdraft-limit surfacing. |
| `/manual-entries` | **keep** | Fold conceptually into setup; keep as editor. |
| `/budgets` | **keep** | — |
| `/bills-and-subscriptions` | **redesign / split** | Split into `/bills` + subscriptions review. |
| `/goals` | **redesign / rename** | Become `/savings-goals` with phases. |
| `/transactions` | **keep** | — |
| `/notifications` | **keep** | — |
| `/ai-coach` | **keep** | Maps to AI / Money Coach. |
| `/settings` | **keep** | — |
| `/settings/connected-accounts` | **keep** | — |
| `/settings/system-readiness` | **keep** (redesign) | Remove Supabase items; add Firestore-available + TrueLayer items. |
| `/sign-in` | **keep** (redesign) | Firebase-only form; drop Supabase form. |
| `/auth/callback` (route) | **remove** | Supabase-only OAuth callback. |

Target routes vs current:

| Target route | Exists? | Action |
| --- | --- | --- |
| `/` | yes | redesign |
| `/setup` | yes | redesign |
| `/accounts` | yes | keep |
| `/payday-planner` | **no** | **add new route** |
| `/overdraft-escape` | **no** | **add new route** |
| `/debt-freedom` | **no** | **add new route** |
| `/bills-account` | **no** | **add new route** |
| `/budgets` | yes | keep |
| `/bills` | partial (`/bills-and-subscriptions`) | **add / split** |
| `/savings-goals` | partial (`/goals`) | rename/redesign |
| `/transactions` | yes | keep |
| `/notifications` | yes | keep |
| `/ai-coach` | yes | keep |
| `/settings` | yes | keep |
| `/settings/system-readiness` | yes | redesign |
| `/settings/connected-accounts` | yes | keep |
| `/sign-in` | yes | redesign (Firebase-only) |

**Net route work:** add 4 brand-new routes (`/payday-planner`, `/overdraft-escape`,
`/debt-freedom`, `/bills-account`), split/rename 2 (`/bills`, `/savings-goals`), remove 1
(`/auth/callback`), redesign the dashboard + setup + readiness + sign-in.

---

## 8. Environment variable audit

Comparing `.env.example` to v2 targets.

**Required free Firebase env vars — present:** all `NEXT_PUBLIC_FIREBASE_*` (api key,
auth domain, project id, app id, storage bucket, messaging sender id), `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `APP_BASE_URL`, `CRON_SECRET`.

**Required free Firebase env vars — missing / not explicit:**
`FIREBASE_BACKEND_ENABLED=true` (spec lists it; selection currently keys off
`BACKEND_PROVIDER`/public keys). Add for clarity.

**Supabase env vars that should stop being primary:**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(currently listed first in `.env.example`). Remove from required; delete in Phase C.

**TrueLayer env vars (optional, present):** `TRUELAYER_CLIENT_ID`,
`TRUELAYER_CLIENT_SECRET`, `TRUELAYER_REDIRECT_URI`, `TRUELAYER_API_BASE_URL`,
`TRUELAYER_AUTH_BASE_URL`, `TRUELAYER_SCOPES`, `TRUELAYER_WEBHOOK_SECRET`,
`TRUELAYER_SANDBOX_ENABLED`. Spec also lists `OPEN_BANKING_PROVIDER=truelayer` —
present (currently defaults to `mock`).

**OpenAI env vars (optional, present):** `OPENAI_API_KEY`, `OPENAI_MODEL`,
`OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`, `AI_MONEY_COACH_ENABLED`.

**Web Push env vars (optional, present):** `WEB_PUSH_VAPID_PUBLIC_KEY`,
`WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `WEB_PUSH_ENABLED`.

**Netlify env vars:** handled in Netlify UI per `netlify.toml`; `NODE_VERSION` set.
`APP_BASE_URL` + `NEXT_PUBLIC_APP_BASE_URL` present.

**Obsolete env vars:** `NEXT_PUBLIC_SITE_URL` (used only in Supabase magic-link redirect),
all `MONEYHUB_*` (deprioritised), `MONEYHUB_SANDBOX_ENABLED`,
`OPEN_BANKING_PROVIDER_PAYLOAD_DEBUG` / `PROVIDER_PAYLOAD_DEBUG_DIR` (dev-only debug).

**Unsafe env vars (must stay server-only — verify never `NEXT_PUBLIC_`):**
`FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`,
`TRUELAYER_CLIENT_SECRET`, `TRUELAYER_WEBHOOK_SECRET`, `MONEYHUB_*` secrets,
`OPENAI_API_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `CRON_SECRET`. All currently named
without `NEXT_PUBLIC_` — **good**; readiness has `assertNoSecretValuesInReadinessReport`.

---

## 9. Test audit

Current tests: `finance.test.ts`, `phase4`, `phase5`, `phase6`, `phase7`, `phase8a`,
`phase8b`, `phase9`, `phase10`, `phase11`, `phase12a`, `phase12b`, `phase12c`,
`provider-payload-inspection`, plus `fixtures/` and `server-only-stub.ts`.

| Test | Verdict | Note |
| --- | --- | --- |
| `finance.test.ts` | **keep** | Deterministic engine; extend for new calcs. |
| `phase4.test.ts` | **keep** | Connection lifecycle util. |
| `phase5.test.tsx` | **keep** | Notifications/PWA. |
| `phase6.test.tsx` | **keep** | Open Banking sandbox foundation. |
| `phase7.test.tsx` | **keep** (deprioritise) | Moneyhub PoC; keep until Moneyhub removed. |
| `phase8a.test.tsx` / `phase8b.test.ts` | **keep** | Event-driven sync + transaction intelligence. |
| `phase9.test.tsx` | **keep** | AI coach + redaction. |
| `phase10.test.tsx` | **keep** | Web push + scheduled notifications. |
| `phase11.test.tsx` | **rewrite** | Staging readiness — drop Supabase assertions. |
| `phase12a.test.tsx` | **keep** | TrueLayer provider comparison. |
| `phase12b.test.ts` | **rewrite** | Netlify staging — remove Supabase-var expectations. |
| `phase12c.test.tsx` | **rewrite** | Currently asserts `supabase` backend selection; make Firebase/mock only. |
| `provider-payload-inspection.test.ts` | **keep** (deprioritise) | Moneyhub mapper hardening. |

**No Supabase-specific test file needs full deletion** — the Supabase coupling is in
assertions inside readiness/selection tests, which are rewrites, not removals.

**Missing tests for v2 workflows:**

- Payday allocation waterfall (7-step ordering, shortfall case).
- Overdraft projection (used vs limit, projected overdraft-free date, pre-payday risk).
- Debt strategy ordering (snowball/avalanche/custom) + debt-free forecast.
- Savings-phase detection (which of 5 phases is active).
- Bills-account funding (funded?/shortfall/required transfer).
- Deterministic "next best action" output.
- `OverdraftPlan` / `PaydayPlan` Firestore round-trip (mock/emulator).

---

## 10. Deployment audit

| Item | State |
| --- | --- |
| `netlify.toml` | Present; primary build config. **Update needed:** comment block still lists Supabase as required staging vars. |
| Netlify scheduled wrappers | Present: `netlify/functions/scheduled-notifications.ts`, `scheduled-bank-sync.ts`, `_scheduled-route.ts` (call protected routes). |
| Vercel fallback | `vercel.json` with two crons. Keep as secondary; not primary. |
| Deployment docs | `docs/deployment-checklist.md`, `docs/netlify-deployment.md` — Firebase-aware but still document Supabase alternate path. Update to Firebase-first. |
| Staging smoke test | `docs/staging-smoke-test.md` — already Firebase-aware (readiness, email/password). Minor updates. |
| Security checklist | `docs/security-checklist.md` — references Supabase RLS + backups. Trim Supabase sections. |
| `APP_BASE_URL` handling | Used in `env.ts` for redirect/callback/webhook checks; present in `.env.example`. **Good.** |
| `CRON_SECRET` protection | Readiness `cron_secret` + `scheduled_routes` checks; scheduled routes reject without it. **Good.** |
| Service worker / PWA assets | `public/sw.js`, `manifest.webmanifest`, `offline.html`, `icons/`. Present. Validate iOS install in Phase H. |

---

## 11. Security audit

| Control | State |
| --- | --- |
| Firebase private key handling | `FIREBASE_PRIVATE_KEY` server-only, normalised with `\\n`→newline in `firebase/env.ts`; never `NEXT_PUBLIC_`. **Good.** |
| Provider token handling | `src/lib/bank-providers/token-store.ts` server-side; tokens not in client-readable Firestore collections. Verify no token reaches client mappers. |
| OpenAI key handling | `OPENAI_API_KEY` server-only; coach route is server (`/api/ai/money-coach`); context redacted (`redaction.ts`). **Good.** |
| TrueLayer client secret | Server-only; webhook secret separate; readiness checks presence without printing. **Good.** |
| Firestore security rules | `firebase/firestore.rules` — user can only read/write own tree, deny by default. **Good.** |
| Client/server boundary | `server-only` import guards on sensitive modules; readiness imports `server-only`. Browser gets only `NEXT_PUBLIC_*`. **Good.** |
| Push subscription handling | User-scoped (`pushSubscriptions`), `endpointHash`, not rendered in UI/logs per schema doc. **Good** (verify no raw endpoint logged). |
| Logging redaction | `src/lib/observability/server-logger.ts` + AI redaction; `assertNoSecretValuesInReadinessReport` guards report serialisation. **Good** (extend redaction coverage to provider payload logs). |
| Audit logging | `auditLog` collection + Firebase audit writer; rules treat user tree as owner-only. Consider append-only hardening (rules currently allow update/delete within own tree). |

**Security risks to note:** (a) Firestore rules allow `update`/`delete` anywhere in the
user's tree, so "append-only audit log" is a convention, not enforced — tighten if
required. (b) Confirm provider raw payloads (`provider-payload-inspection`) never persist
to a client-readable collection.

---

## 12. Recommended implementation plan (safe sequence)

Order chosen so each step is low-risk and reversible, backend correctness precedes UI,
and the manual/mock path never breaks.

**Stage 0 — Guardrails (no behaviour change)**
1. Confirm mock mode works end-to-end (baseline regression anchor).
2. Add tests pinning current Firebase + mock selection behaviour before edits.

**Stage 1 — Highest-priority backend correctness**
3. Add `OverdraftPlan` + `PaydayPlan` domain types + Firestore mappers/validation.
4. Make Firebase the sole non-mock backend in `provider.ts` (keep `supabase` value
   accepted but inert first, then remove) — low-risk staged switch.

**Stage 2 — Supabase removal (backend rebase)**
5. Replace Supabase branches in `route-auth.ts`, `middleware.ts`, repositories,
   `profiles.ts` with the existing Firebase equivalents.
6. Remove `/auth/callback`, Supabase sign-in action/form.
7. Remove Supabase readiness/env checks; reduce provider union to `firebase | mock`.
8. Delete `src/lib/supabase/*`, drop `@supabase/*` deps, archive `supabase/migrations/`.
9. Clean `.env.example`, `netlify.toml` comment, deployment/security docs.

**Stage 3 — Deterministic engine (the v2 maths)**
10. Implement payday waterfall, overdraft projection, debt strategy ordering +
    forecast, savings phases, bills-account funding, single next-best-action.
11. Unit-test all of the above with synthetic data.

**Stage 4 — Product / UI reshape**
12. Add `/payday-planner`, `/overdraft-escape`, `/debt-freedom`, `/bills-account`.
13. Split `/bills`, rename `/goals`→`/savings-goals`, redesign dashboard tiles.
14. Extend `/setup` to full spec field set; redesign sign-in (Firebase-only) and
    system-readiness (Firebase items, no Supabase).

**Stage 5 — Provider + notifications validation**
15. Validate TrueLayer sandbox end-to-end; confirm no token leakage.
16. Validate all in-app notification types; optional Web Push.

**Stage 6 — Test rewrite + deployment validation**
17. Rewrite `phase11/12b/12c` for Firebase-only; add the missing workflow tests (§9).
18. Netlify staging deploy on Firebase free path; green readiness; smoke test; security
    invariant review.

---

## 13. Risk list

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Breaking mock mode during Supabase removal | Medium | Treat mock as the regression baseline; keep `isMockBackend` short-circuits; test before/after each removal step. |
| Auth route regression (lockout) | Medium | Keep Firebase session-cookie path untouched; change middleware Supabase branch last; test `/sign-in`→cookie→protected route on each change. |
| Firestore security rule mistakes | High impact | Don't loosen `firestore.rules`; add emulator round-trip tests; review any new collection against deny-by-default. |
| Accidentally exposing private keys | High impact | Never add `NEXT_PUBLIC_` to admin/secret vars; keep `server-only` guards; keep `assertNoSecretValuesInReadinessReport`; grep for secret names in client bundles. |
| Provider token exposure | High impact | Keep tokens in server-only token store; verify mappers strip tokens before returning to client; never persist tokens in user-readable collections. |
| Feature-flag confusion | Medium | Centralise defaults (all optional OFF); document in one place; readiness reflects effective flags. |
| Netlify server/runtime incompatibilities | Medium | Keep `@netlify/plugin-nextjs`; verify Admin SDK + `server-only` modules run in Netlify Next runtime; test scheduled functions against protected routes. |
| TrueLayer callback issues | Medium | Sandbox-only; `TRUELAYER_REDIRECT_URI` must match portal + `APP_BASE_URL`; keep `OPEN_BANKING_ENABLED=false` default. |
| Data migration complexity | Low (single user) | No live Supabase production data assumed; if any exists, export → transform → Firestore import as a one-off, not in the hot path. |
| Collection rename drift | Low | Introduce spec names with temporary read aliases; migrate, then drop aliases. |

---

## 14. Final recommendation

**Refactor the current repo in place, on a dedicated `v2` working branch.**

Justification:

- **Firebase is already a first-class, working path** — Auth, Admin, session cookies,
  Firestore repository, rules, and readiness checks all exist. v2 is predominantly a
  *subtraction* (Supabase) plus *additive* product features, not a rebuild.
- **The deterministic finance engine and transaction intelligence are mature and
  reusable** — the most valuable, hardest-to-rebuild assets are already here and pass
  tests. A fresh repo would force re-porting them with no upside.
- **Supabase coupling is shallow and well-isolated** — it lives behind
  `isFirebaseBackend()` guards and a small `src/lib/supabase/*` surface, so removal is
  mechanical and testable rather than entangled.
- **Mock mode gives a safe regression baseline** for every refactor step.
- A **clean `v2` branch** (not `main` directly) isolates risk, allows incremental PRs per
  stage, and keeps `main` deployable throughout.

A fresh repo or port-selected-components approach is **not** recommended: it would discard
working Firebase + engine code, re-introduce integration risk, and slow delivery with no
architectural benefit, given how contained the Supabase removal is.

---

## Appendix: evidence index (key files)

- Backend selection: `src/lib/backend/provider.ts`
- Auth: `src/lib/firebase/session.ts`, `src/lib/server/route-auth.ts`, `middleware.ts`,
  `src/app/sign-in/*`, `src/app/api/auth/firebase-session/route.ts`, `src/app/auth/callback/route.ts`
- Repositories: `src/lib/repositories/{finance,service-finance,notification,firebase}-repository.ts`,
  `profiles.ts`, `mappers.ts`, `audit.ts`
- Engine: `src/lib/finance.ts`, `src/lib/transaction-intelligence.ts`
- Providers: `src/lib/bank-providers/*`
- AI: `src/lib/ai/*`, `src/app/api/ai/money-coach/route.ts`
- Notifications: `src/lib/notifications/*`, `netlify/functions/*`
- Readiness/env: `src/lib/deployment/{readiness,env}.ts`
- Domain: `src/lib/domain.ts`
- Rules: `firebase/firestore.rules`
- Config: `netlify.toml`, `vercel.json`, `.env.example`, `package.json`
- Tests: `tests/*`
- Supabase (to remove): `src/lib/supabase/*`, `supabase/migrations/*`
