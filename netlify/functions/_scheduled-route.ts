type ScheduledRouteResult = {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
};

function normaliseBaseUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

export function resolveScheduledBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return (
    normaliseBaseUrl(env.APP_BASE_URL) ??
    normaliseBaseUrl(env.NEXT_PUBLIC_APP_BASE_URL) ??
    normaliseBaseUrl(env.URL) ??
    normaliseBaseUrl(env.DEPLOY_PRIME_URL) ??
    normaliseBaseUrl(env.VERCEL_URL)
  );
}

export async function invokeProtectedScheduledRoute(
  path:
    | "/api/notifications/scheduled"
    | "/api/bank-connections/scheduled-sync"
    | "/api/scheduled/bank-sync",
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScheduledRouteResult> {
  const cronSecret = env.CRON_SECRET;
  const baseUrl = resolveScheduledBaseUrl(env);

  if (!cronSecret) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: {
          code: "cron_secret_missing",
          message: "Netlify scheduled function is missing cron configuration.",
        },
      }),
    };
  }

  if (!baseUrl) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: {
          code: "app_base_url_missing",
          message: "Netlify scheduled function is missing the app base URL.",
        },
      }),
    };
  }

  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${cronSecret}`,
      "x-cron-secret": cronSecret,
      "user-agent": "personal-finance-hq-netlify-scheduled-function",
    },
  });

  return {
    statusCode: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    body: await response.text(),
  };
}
