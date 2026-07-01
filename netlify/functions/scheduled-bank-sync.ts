import { invokeProtectedScheduledRoute } from "./_scheduled-route";

export const config = {
  schedule: "15 7,19 * * *",
};

export default async function scheduledBankSync() {
  return invokeProtectedScheduledRoute("/api/scheduled/bank-sync");
}
