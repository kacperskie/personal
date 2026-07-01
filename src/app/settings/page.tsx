import Link from "next/link";
import { Activity, Cable, ClipboardList, ShieldCheck, ToggleLeft } from "lucide-react";
import { NotificationPreferencesManager } from "@/components/notifications/notification-preferences-manager";
import { PageHeader } from "@/components/page-header";
import { InstallGuidance } from "@/components/pwa/install-guidance";
import { SignOutButton } from "@/components/sign-out-button";
import { getClientWebPushConfig } from "@/lib/notifications/web-push";
import { getNotificationPreferences } from "@/lib/repositories/notification-repository";
import { getBackendProvider } from "@/lib/backend/provider";
import { isFirebaseBackendConfigured } from "@/lib/firebase/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const backendProvider = getBackendProvider();
  const firebaseConfigured = isFirebaseBackendConfigured();
  const notificationPreferences = await getNotificationPreferences();
  const webPush = getClientWebPushConfig();
  const persistenceStatus =
    backendProvider === "firebase"
      ? firebaseConfigured
        ? "Firebase Auth and Firestore are configured for the Netlify free path."
        : "Firebase is selected but not fully configured, so mock fallback remains important."
      : "Mock data mode is selected, so no persistent backend is required.";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Private workspace"
        title="Settings"
        description="Mock settings for data mode, safety boundaries, and future feature flags."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <Cable className="h-5 w-5 text-teal" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-ink">Connected accounts</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Account connection is the primary data path. This phase uses mock provider
            data for American Express, Nationwide, and Revolut.
          </p>
          <Link
            href="/settings/connected-accounts"
            className="mt-4 inline-flex rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            View connections
          </Link>
        </article>

        <article className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <ShieldCheck className="h-5 w-5 text-teal" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-ink">Data mode</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            {persistenceStatus}
          </p>
          {backendProvider !== "mock" ? <div className="mt-4"><SignOutButton /></div> : null}
        </article>

        <article className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <ClipboardList className="h-5 w-5 text-teal" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-ink">Setup wizard</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Convert the old Google Sheets-style tracker into accounts, bills,
            subscriptions, manual entries, goals, debts, and review preferences.
          </p>
          <Link
            href="/setup"
            className="mt-4 inline-flex rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Open setup
          </Link>
        </article>

        <article className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <ToggleLeft className="h-5 w-5 text-saffron" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-ink">Feature flags</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink/70">Open Banking</dt>
              <dd className="rounded-full bg-moss/10 px-3 py-1 font-semibold text-moss">
                Mock only
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink/70">AI API calls</dt>
              <dd className="rounded-full bg-saffron/10 px-3 py-1 font-semibold text-saffron">
                Off
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink/70">CSV import</dt>
              <dd className="rounded-full bg-saffron/10 px-3 py-1 font-semibold text-saffron">
                Not in roadmap
              </dd>
            </div>
          </dl>
        </article>

        <article className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <Activity className="h-5 w-5 text-teal" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-ink">System readiness</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Review safe deployment checks for Firebase, Firestore, TrueLayer, OpenAI,
            Web Push, cron protection, redirects, and webhook setup.
          </p>
          <Link
            href="/settings/system-readiness"
            className="mt-4 inline-flex rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            View readiness
          </Link>
        </article>
      </section>

      <NotificationPreferencesManager
        preferences={notificationPreferences}
        webPushPublicKey={webPush.publicKey}
        webPushConfigured={webPush.configured}
        deliveryEnabled={webPush.deliveryEnabled}
      />

      <InstallGuidance />

      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="text-base font-semibold text-ink">Safety rules</h2>
        <ul className="mt-4 grid gap-3 text-sm text-ink/70 md:grid-cols-2">
          <li>Financial calculations stay deterministic in code.</li>
          <li>AI can explain, summarise, forecast, and suggest.</li>
          <li>External actions require explicit user confirmation.</li>
          <li>Regulated advice topics remain educational and signposted.</li>
        </ul>
      </section>
    </div>
  );
}
