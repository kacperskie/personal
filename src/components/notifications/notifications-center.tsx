"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, ExternalLink, Inbox, Trash2 } from "lucide-react";
import {
  dismissNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/notifications/actions";
import { StatusPill } from "@/components/status-pill";
import type { AppNotification, NotificationSeverity } from "@/lib/domain";
import { formatDateShort } from "@/lib/format";

const severityTone: Record<NotificationSeverity, "good" | "neutral" | "warning" | "risk"> = {
  info: "neutral",
  warning: "warning",
  urgent: "risk",
};

const severityOptions: Array<NotificationSeverity | "all"> = [
  "all",
  "info",
  "warning",
  "urgent",
];

function label(value: string) {
  return value.replaceAll("_", " ");
}

export function NotificationsCenter({
  notifications,
  unreadCount,
}: {
  notifications: AppNotification[];
  unreadCount: number;
}) {
  const [items, setItems] = useState(notifications);
  const [filter, setFilter] = useState<NotificationSeverity | "all">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredItems = useMemo(
    () =>
      items.filter(
        (notification) =>
          notification.status !== "dismissed" &&
          (filter === "all" || notification.severity === filter),
      ),
    [filter, items],
  );

  function markRead(id: string) {
    setMessage(null);
    startTransition(() => {
      void markNotificationReadAction(id)
        .then((updated) => {
          if (updated) {
            setItems((current) =>
              current.map((notification) =>
                notification.id === updated.id ? updated : notification,
              ),
            );
          }
        })
        .catch((error: Error) => setMessage(error.message));
    });
  }

  function markAllRead() {
    setMessage(null);
    startTransition(() => {
      void markAllNotificationsReadAction()
        .then((updated) => setItems(updated))
        .catch((error: Error) => setMessage(error.message));
    });
  }

  function dismiss(id: string) {
    setMessage(null);
    startTransition(() => {
      void dismissNotificationAction(id)
        .then((updated) => {
          if (updated) {
            setItems((current) =>
              current.map((notification) =>
                notification.id === updated.id ? updated : notification,
              ),
            );
          }
        })
        .catch((error: Error) => setMessage(error.message));
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-ink/60">Unread notifications</p>
            <p className="mt-1 text-3xl font-semibold text-ink">{unreadCount}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {severityOptions.map((severity) => (
              <button
                key={severity}
                type="button"
                onClick={() => setFilter(severity)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                  filter === severity
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-paper text-ink/70"
                }`}
              >
                {label(severity)}
              </button>
            ))}
            <button
              type="button"
              onClick={markAllRead}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Mark all read
            </button>
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-berry">{message}</p> : null}
      </section>

      <section className="grid gap-3">
        {filteredItems.length === 0 ? (
          <div className="rounded-lg border border-line bg-white p-5 text-sm text-ink/60 shadow-panel">
            <Inbox className="mb-3 h-5 w-5 text-teal" aria-hidden="true" />
            No notifications match this filter.
          </div>
        ) : null}

        {filteredItems.map((notification) => (
          <article
            key={notification.id}
            className={`rounded-lg border bg-white p-5 shadow-panel ${
              notification.status === "unread" ? "border-teal/50" : "border-line"
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-ink">{notification.title}</h2>
                  <StatusPill
                    label={notification.severity}
                    tone={severityTone[notification.severity]}
                  />
                  <StatusPill
                    label={notification.status}
                    tone={notification.status === "unread" ? "warning" : "neutral"}
                  />
                </div>
                <p className="mt-2 text-sm leading-6 text-ink/70">{notification.body}</p>
                <p className="mt-2 text-xs text-ink/50">
                  {formatDateShort(notification.createdAt.slice(0, 10))}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {notification.actionHref ? (
                  <Link
                    href={notification.actionHref}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Open
                  </Link>
                ) : null}
                {notification.status === "unread" ? (
                  <button
                    type="button"
                    onClick={() => markRead(notification.id)}
                    disabled={isPending}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Read
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => dismiss(notification.id)}
                  disabled={isPending}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-berry disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Dismiss
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
