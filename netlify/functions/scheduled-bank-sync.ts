import { invokeProtectedScheduledRoute } from "./_scheduled-route";

export const config = {
  schedule: "15 */6 * * *",
};

export default async function scheduledBankSync() {
  return invokeProtectedScheduledRoute("/api/bank-connections/scheduled-sync");
}
