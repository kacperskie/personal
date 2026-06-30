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

Each authenticated user can read and write only `users/{auth.uid}` and nested collections below that document. All other reads and writes are denied by default.

Push subscription records are sensitive and must not be displayed in UI or logs.

## Spreadsheet Tracker Onboarding

The setup wizard at `/setup` helps translate the old Google Sheets-style tracker into structured finance data:

- current accounts and savings pots
- bills and Direct Debits
- subscriptions
- debts and money owed
- payday, buffer, and review preferences

The wizard stores no real bank credentials and does not enable live Open Banking.
