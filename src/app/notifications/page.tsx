import { PageHeader } from "@/components/page-header";
import { NotificationsCenter } from "@/components/notifications/notifications-center";
import {
  getNotifications,
  getUnreadNotificationCount,
} from "@/lib/repositories/notification-repository";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [notifications, unreadCount] = await Promise.all([
    getNotifications(),
    getUnreadNotificationCount(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notification centre"
        title="Notifications"
        description="Review in-app finance alerts. Browser notification delivery remains a placeholder until a future push phase."
      />

      <NotificationsCenter notifications={notifications} unreadCount={unreadCount} />
    </div>
  );
}
