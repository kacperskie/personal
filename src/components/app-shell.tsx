"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BookOpenText,
  CalendarClock,
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
  { label: "AI Coach", href: "/ai-coach", icon: Bot },
  { label: "Settings", href: "/settings", icon: Settings },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-white/90 px-4 py-4 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <Link href="/" className="flex items-center gap-3" aria-label="Personal Finance HQ home">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white">
            <WalletCards className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">
              Personal Finance HQ
            </span>
            <span className="block text-xs text-ink/55">Private mock workspace</span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-ink text-white"
                    : "text-ink/70 hover:bg-paper hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 hidden rounded-lg border border-line bg-paper p-4 lg:block">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-moss">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Phase 4
          </div>
          <p className="mt-2 text-sm leading-5 text-ink/65">
            Supabase-ready persistence with mock provider data. Real banking APIs are off.
          </p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="border-b border-line bg-paper/85 px-4 py-4 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal">
                Direct account connection foundation
              </p>
              <p className="mt-1 text-sm text-ink/60">
                Mock American Express, Nationwide, and Revolut data only.
              </p>
            </div>
            <div className="flex w-fit items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-ink/70">
              <span className="h-2 w-2 rounded-full bg-moss" aria-hidden="true" />
              Mock data active
            </div>
          </div>
        </header>

        <div className="px-4 py-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
