# AGENTS.md

## Project
Personal Finance HQ is a private UK-focused personal finance dashboard with an AI money coach.

## Product goal
Build a secure web dashboard that helps the user understand spending, budgets, bills, subscriptions, savings goals, cashflow, debt, and net worth.

## MVP scope
Use mock/local data first, then direct account connection through Open Banking as the primary data path. CSV import is not part of the main roadmap. Manual inputs remain required for debts, money owed, offline balances, pensions, future expenses, manual income, manual bills, and anything Open Banking cannot see.

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
- Never expose provider tokens to browser code.
- Never commit Supabase credentials, provider credentials, access tokens, refresh tokens, or real financial records.
- Require explicit user confirmation before any external action.
- Keep real Open Banking API calls behind a feature flag until sandbox credentials, OAuth redirects, secure token storage, and security review are in place.
- Keep Supabase access behind typed helpers and repository functions.
- Keep mock/local fallback available for development when Supabase is not configured.
- Enable RLS on every user-owned table and scope rows by `auth.uid() = user_id`.
- Use UK terminology: current account, Direct Debit, standing order, ISA, pension, council tax.

## Safety rules
The AI can explain, summarise, categorise, forecast, and suggest.
The AI requires approval before changing budgets, creating rules, sending emails, moving money, or connecting external accounts.
The AI should avoid regulated investment, pension transfer, mortgage, tax filing, and formal debt-solution advice.

## Development rules
- Make small, reviewable changes.
- Add tests for calculations.
- Add or update tests for repository logic, RLS migrations, and security boundaries when persistence changes.
- Keep pages responsive.
- Treat iPhone Safari and Home Screen PWA mode as first-class responsive targets.
- Keep mobile navigation clear of safe-area insets and the iPhone Home indicator.
- Use accessible UI components.
- Run linting, type-checking, tests, build, and audit before reporting completion.
- Update README.md when setup or commands change.

## Supabase and Open Banking rules
- Required local placeholders: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Open Banking placeholders stay mock-only until a provider sandbox is explicitly configured.
- Provider tokens must only be handled in server-only modules.
- Production token storage should use encrypted storage or provider-managed token vaulting where available.
- Do not add real Open Banking API calls, real provider credentials, or token persistence without a security review.

## Mobile, PWA, and notification rules
- Keep the app installable with `manifest.webmanifest`, iOS web app metadata, Apple touch icon placeholders, and service worker registration.
- Service worker code may provide offline fallback, notification-click handling, and placeholder push handling only.
- Do not add real push notification delivery until explicit permission, secure subscription storage, endpoint redaction, VAPID/provider setup, and security review are in place.
- Do not request browser notification permission automatically; only request it after the user taps an Enable Notifications control.
- Keep notification copy shown outside the app privacy-safe by default. Avoid amounts, bank names, account names, and detailed financial facts in browser notification text.
- Detailed notification content may appear only inside the authenticated app.
- Treat push subscription records as sensitive and avoid exposing endpoint internals in UI or logs.

## Important documents
Read these before implementation:
- docs/project-definition.md
- docs/functional-design.md
- docs/technical-architecture.md
- backlog.md
