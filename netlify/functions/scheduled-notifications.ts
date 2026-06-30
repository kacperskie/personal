import { invokeProtectedScheduledRoute } from "./_scheduled-route";

export const config = {
  schedule: "0 8 * * *",
};

export default async function scheduledNotifications() {
  return invokeProtectedScheduledRoute("/api/notifications/scheduled");
}
