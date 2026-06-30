# Staging Smoke Test

Use this checklist after deploying Personal Finance HQ to staging. Use fake/demo data only.

## Access And Auth

- Sign up with a staging test account.
- Sign in with the staging test account.
- Sign out and confirm protected routes redirect to sign-in.
- Visit `/settings/system-readiness` and confirm no secret values are shown.

## Core Pages

- Dashboard loads.
- Accounts page loads.
- Transactions page loads.
- Bills & Subscriptions page loads.
- Goals page loads.
- Manual Entries page loads.
- Notifications page loads.
- AI Coach page loads.
- Settings page loads.

## Manual Entries

- Create a fake manual entry.
- Edit amount, status, cashflow inclusion and net-worth inclusion.
- Delete the manual entry.
- Confirm no real financial data was entered.

## Connected Accounts

- Open Settings / Connected Accounts.
- Confirm provider readiness copy is safe.
- Start Moneyhub sandbox connection.
- If Moneyhub is not configured, confirm the route returns a safe not-configured state.
- Visit the callback route with invalid state and confirm safe failure.
- Run manual sync with Moneyhub disabled and confirm safe failure.

## Notifications And Push

- Save notification preferences.
- Confirm quiet hours values save.
- Tap Enable Notifications only from an installed PWA test where possible.
- Confirm browser permission status is shown.
- Run the test notification route from Settings.
- Confirm push payload copy is generic.
- Confirm scheduled notification route rejects a missing or invalid cron secret.

## AI Coach

- Ask "What changed this month?" with OpenAI disabled and confirm deterministic fallback.
- Ask "Build my payday plan" with OpenAI disabled and confirm no server error.
- If OpenAI is configured, ask the same questions and confirm structured response sections.
- Confirm the response includes assumptions, risks/watchouts and data-used summary.

## PWA And Offline

- Confirm `/manifest.webmanifest` loads.
- Confirm `/sw.js` loads.
- Install on iPhone through Safari Share -> Add to Home Screen.
- Open from the Home Screen icon.
- Confirm mobile navigation avoids the home indicator.
- Disable network and confirm offline fallback appears for navigation.

## Scheduled Jobs

- Call `/api/notifications/scheduled` with invalid secret and expect 401.
- Call `/api/bank-connections/scheduled-sync` with invalid secret and expect 401.
- Call both routes with staging cron secret and confirm safe JSON output.

## Final Checks

- Confirm no provider tokens appear in logs.
- Confirm no OpenAI API keys appear in logs.
- Confirm no VAPID private key appears in logs.
- Confirm no real financial data was used.
