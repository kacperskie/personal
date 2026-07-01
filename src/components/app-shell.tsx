"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BookOpenText,
  CalendarClock,
  Bell,
  ClipboardList,
  CreditCard,
  Gauge,
  LayoutDashboard,
  Landmark,
  PiggyBank,
  ReceiptText,
  Settings,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Accounts", href: "/accounts", icon: Landmark },
  { label: "Transactions", href: "/transactions", icon: CreditCard },
  { label: "Budgets", href: "/budgets", icon: Gauge },
  { label: "Bills & Subscriptions", href: "/bills-and-subscriptions", icon: ReceiptText },
  { label: "Goals", href: "/goals", icon: PiggyBank },
  { label: "Manual Entries", href: "/manual-entries", icon: BookOpenText },
  { label: "Setup", href: "/setup", icon: ClipboardList },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "AI Coach", href: "/ai-coach", icon: Bot },
  { label: "Settings", href: "/settings", icon: Settings },
];

const mobilePrimaryItems: NavItem[] = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Accounts", href: "/accounts", icon: Landmark },
  { label: "Bills", href: "/bills-and-subscriptions", icon: ReceiptText },
  { label: "Alerts", href: "/notifications", icon: Bell },
  { label: "Settings", href: "/settings", icon: Settings },
];

const mobileSecondaryItems: NavItem[] = [
  { label: "Transactions", href: "/transactions", icon: CreditCard },
  { label: "Budgets", href: "/budgets", icon: Gauge },
  { label: "Goals", href: "/goals", icon: PiggyBank },
  { label: "Manual", href: "/manual-entries", icon: BookOpenText },
  { label: "Setup", href: "/setup", icon: ClipboardList },
  { label: "AI Coach", href: "/ai-coach", icon: Bot },
];

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) {
    return false;
  }

  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-berry px-1 text-[11px] font-semibold leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function AppShell({
  children,
  unreadNotificationCount = 0,
  appModeLabel = "Private finance workspace",
  appModeDescription = "Read-only account data with deterministic finance rules.",
  appModeTone = "live",
}: {
  children?: React.ReactNode;
  unreadNotificationCount?: number;
  appModeLabel?: string;
  appModeDescription?: string;
  appModeTone?: "live" | "mock" | "setup";
}) {
  const pathname = usePathname();
  const badgeLabel =
    appModeTone === "mock"
      ? "Mock mode"
      : appModeTone === "setup"
        ? "Setup needed"
        : "Live read-only";

  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden border-line bg-white/90 px-4 py-4 backdrop-blur lg:sticky lg:top-0 lg:block lg:h-screen lg:border-r lg:px-5 lg:py-6">
        <Link href="/" className="flex items-center gap-3" aria-label="Personal Finance HQ home">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white">
            <WalletCards className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">
              Personal Finance HQ
            </span>
            <span className="block text-xs text-ink/55">{badgeLabel}</span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            const showBadge = item.href === "/notifications";

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-ink text-white"
                    : "text-ink/70 hover:bg-paper hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
                {showBadge ? <NotificationBadge count={unreadNotificationCount} /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 hidden rounded-lg border border-line bg-paper p-4 lg:block">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-moss">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {appModeLabel}
          </div>
          <p className="mt-2 text-sm leading-5 text-ink/65">
            {appModeDescription}
          </p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:static lg:px-8 lg:py-4">
          <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
            <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Personal Finance HQ home">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
                <WalletCards className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">
                  Personal Finance HQ
                </span>
                <span className="block text-xs text-ink/55">PWA-ready workspace</span>
              </span>
            </Link>
            <Link
              href="/notifications"
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              <NotificationBadge count={unreadNotificationCount} />
            </Link>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal">
                {appModeLabel}
              </p>
              <p className="mt-1 text-sm text-ink/60">
                {appModeDescription}
              </p>
            </div>
            <div className="flex w-fit items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-ink/70">
              <span
                className={`h-2 w-2 rounded-full ${
                  appModeTone === "mock"
                    ? "bg-saffron"
                    : appModeTone === "setup"
                      ? "bg-berry"
                      : "bg-moss"
                }`}
                aria-hidden="true"
              />
              {badgeLabel}
            </div>
          </div>

          <nav
            aria-label="Secondary mobile navigation"
            className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden"
          >
            {mobileSecondaryItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    active
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-ink/70"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <div className="px-4 py-5 pb-[calc(6rem+var(--safe-area-bottom))] sm:px-5 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>

      <nav
        aria-label="Primary mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-2 pb-[calc(0.5rem+var(--safe-area-bottom))] pt-2 shadow-panel backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-5 gap-1">
          {mobilePrimaryItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            const showBadge = item.href === "/notifications";

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold ${
                  active ? "bg-ink text-white" : "text-ink/70"
                }`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {showBadge ? <NotificationBadge count={unreadNotificationCount} /> : null}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
