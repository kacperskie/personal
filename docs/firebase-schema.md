# Firebase Schema

Phase 12C adds Firebase as the primary free backend for Netlify staging while keeping Supabase and mock fallback available.

## Backend Selection

Set `BACKEND_PROVIDER=firebase` to use Firebase Auth, Firebase Admin session cookies, and Firestore repositories.

Supported values:

- `firebase`: primary free deployment path.
- `supabase`: existing Supabase Auth/Postgres path.
- `mock`: local mock data only.

## Authentication

Firebase Auth uses email/password compatible sign-in in the app. The browser receives only Firebase public web app configuration. After sign-in, the app exchanges the Firebase ID token for an HTTP-only session cookie through `/api/auth/firebase-session`.

Firebase Admin credentials are server-side only:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Do not expose Admin credentials to browser code.

## Firestore Layout

All user-owned data is stored below the authenticated user document:

```text
users/{userId}
users/{userId}/accounts/{accountId}
users/{userId}/aiInsights/{insightId}
users/{userId}/appNotifications/{notificationId}
users/{userId}/bankConnections/{connectionId}
users/{userId}/bills/{billId}
users/{userId}/budgetPeriods/{periodId}
users/{userId}/budgets/{budgetId}
users/{userId}/cashflowEvents/{eventId}
users/{userId}/categories/{categoryId}
users/{userId}/debts/{debtId}
users/{userId}/detectedBills/{detectedBillId}
users/{userId}/detectedSubscriptions/{detectedSubscriptionId}
users/{userId}/manualFinanceItems/{itemId}
users/{userId}/merchantRules/{ruleId}
users/{userId}/notificationDeliveryAttempts/{attemptId}
users/{userId}/notificationPreferences/{preferenceId}
users/{userId}/providerTokens/{connectionId}
users/{userId}/providerSyncEvents/{eventId}
users/{userId}/pushSubscriptions/{subscriptionId}
users/{userId}/recurringPaymentCandidates/{candidateId}
users/{userId}/savingsGoals/{goalId}
users/{userId}/spendingAnomalies/{anomalyId}
users/{userId}/subscriptions/{subscriptionId}
users/{userId}/transactionEnrichments/{enrichmentId}
users/{userId}/transactions/{transactionId}
users/{userId}/auditLog/{auditEventId}
```

Firestore documents use the existing TypeScript domain field names, for example `updatedAt`, `includeInSafeToSpend`, and `providerTransactionId`.

## Security Rules

Rules live in `firebase/firestore.rules`.

Each authenticated user can read and write only `users/{auth.uid}` and client-safe nested collections below that document. `providerTokens` is denied to browser clients and written only through Firebase Admin. All other reads and writes are denied by default.

Provider token records store encrypted Open Banking token payloads only. They are written
server-side under `users/{userId}/providerTokens/{connectionId}` and require
`TOKEN_ENCRYPTION_KEY` when TrueLayer is enabled. Do not display encrypted token
payloads, token references, provider account numbers, or raw provider payloads in UI or logs.

Push subscription records are sensitive and must not be displayed in UI or logs.

## TrueLayer Read-Only Foundation

Set these only for sandbox testing:

- `OPEN_BANKING_ENABLED=true`
- `OPEN_BANKING_PROVIDER=truelayer`
- `TRUELAYER_SANDBOX_ENABLED=true`
- `TRUELAYER_CLIENT_ID`
- `TRUELAYER_CLIENT_SECRET`
- `TRUELAYER_REDIRECT_URI=https://your-site.netlify.app/api/bank-connections/callback`
- `TRUELAYER_API_BASE_URL=https://api.truelayer-sandbox.com`
- `TRUELAYER_AUTH_BASE_URL=https://auth.truelayer-sandbox.com`
- `TRUELAYER_SCOPES=info accounts balance transactions cards offline_access`
- `TOKEN_ENCRYPTION_KEY` with at least 32 characters

This foundation is read-only. It can start consent, handle the callback, store
encrypted tokens server-side, sync accounts, balances, and transactions, then
drive dashboard calculations from those records. Payments, bank transfers, AI
coach behaviour, and webhook-driven sync remain disabled/delayed.

## Spreadsheet Tracker Onboarding

The setup wizard at `/setup` helps translate the old Google Sheets-style tracker into structured finance data:

- current accounts and savings pots
- bills and Direct Debits
- subscriptions
- debts and money owed
- payday, buffer, and review preferences

The wizard stores no real bank credentials and does not enable live Open Banking.
