import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTrueLayerAuthorizationUrl,
  TrueLayerProvider,
} from "../src/lib/bank-providers/truelayer-provider";
import {
  getTrueLayerProviderConfig,
  getTrueLayerSandboxReadiness,
  type TrueLayerProviderConfig,
  type TrueLayerSandboxReadiness,
} from "../src/lib/bank-providers/provider-config";
import { ConnectedAccountsManager } from "../src/components/connected-accounts/connected-accounts-manager";
import type { BankConnection } from "../src/lib/domain";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const sandboxConfig: TrueLayerProviderConfig = {
  provider: "truelayer",
  openBankingEnabled: true,
  clientId: "sandbox-client",
  clientSecret: "sandbox-secret-value",
  redirectUri: "http://localhost:3000/api/bank-connections/callback",
  webhookSecret: "wh-secret",
  apiBaseUrl: "https://api.truelayer-sandbox.com",
  authBaseUrl: "https://auth.truelayer-sandbox.com",
  scopes: ["info", "accounts", "balance", "transactions", "offline_access"],
  configured: true,
  sandboxMode: true,
  mode: "sandbox",
  cardsEnabled: false,
};

const liveConfig: TrueLayerProviderConfig = {
  ...sandboxConfig,
  clientId: "live-client",
  clientSecret: "live-secret-value",
  apiBaseUrl: "https://api.truelayer.com",
  authBaseUrl: "https://auth.truelayer.com",
  sandboxMode: false,
  mode: "live",
};

function providerState(readiness: TrueLayerSandboxReadiness) {
  return {
    provider: "truelayer" as const,
    configured: readiness.configured,
    safeMessage: readiness.safeMessage,
    truelayerReadiness: readiness,
  };
}

function renderManager(readiness: TrueLayerSandboxReadiness, connections: BankConnection[] = []) {
  return renderToStaticMarkup(
    createElement(ConnectedAccountsManager, {
      connections,
      tokenDiagnostics: {},
      providerState: providerState(readiness),
    }),
  );
}

const liveEnv = {
  OPEN_BANKING_ENABLED: "true",
  OPEN_BANKING_PROVIDER: "truelayer",
  TRUELAYER_SANDBOX_ENABLED: "false",
  TRUELAYER_CLIENT_ID: "live-client-id",
  TRUELAYER_CLIENT_SECRET: "live-secret-value",
  TRUELAYER_REDIRECT_URI: "https://app.example.com/api/bank-connections/callback",
  TOKEN_ENCRYPTION_KEY: "x".repeat(32),
} as unknown as NodeJS.ProcessEnv;

describe("TrueLayer mode-aware config", () => {
  it("sandbox mode: sandbox URLs and mode", () => {
    const config = getTrueLayerProviderConfig({} as NodeJS.ProcessEnv);
    expect(config.mode).toBe("sandbox");
    expect(config.apiBaseUrl).toBe("https://api.truelayer-sandbox.com");
    expect(config.authBaseUrl).toBe("https://auth.truelayer-sandbox.com");
  });

  it("live mode: live URLs and mode when TRUELAYER_SANDBOX_ENABLED=false", () => {
    const config = getTrueLayerProviderConfig({
      TRUELAYER_SANDBOX_ENABLED: "false",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.mode).toBe("live");
    expect(config.apiBaseUrl).toBe("https://api.truelayer.com");
    expect(config.authBaseUrl).toBe("https://auth.truelayer.com");
  });
});

describe("TrueLayer auth URL provider hint", () => {
  it("sandbox mode includes providers=uk-cs-mock", () => {
    const { authorizationUrl } = buildTrueLayerAuthorizationUrl({
      config: sandboxConfig,
      redirectUri: sandboxConfig.redirectUri!,
      state: "state_sandbox",
    });
    expect(authorizationUrl.searchParams.get("providers")).toBe("uk-cs-mock");
  });

  it("live mode does not include providers=uk-cs-mock", () => {
    const { authorizationUrl } = buildTrueLayerAuthorizationUrl({
      config: liveConfig,
      redirectUri: liveConfig.redirectUri!,
      state: "state_live",
    });
    expect(authorizationUrl.searchParams.has("providers")).toBe(false);
    expect(authorizationUrl.hostname).toBe("auth.truelayer.com");
  });
});

describe("TrueLayer readiness mode + warning", () => {
  it("reports live mode and warns when the client ID starts with sandbox- (no secrets)", () => {
    vi.stubEnv("OPEN_BANKING_ENABLED", "true");
    vi.stubEnv("OPEN_BANKING_PROVIDER", "truelayer");
    vi.stubEnv("TRUELAYER_SANDBOX_ENABLED", "false");
    vi.stubEnv("TRUELAYER_CLIENT_ID", "sandbox-leftover-id");
    vi.stubEnv("TRUELAYER_CLIENT_SECRET", "live-secret-value");
    vi.stubEnv("TRUELAYER_REDIRECT_URI", "https://app.example.com/api/bank-connections/callback");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "x".repeat(32));

    const readiness = getTrueLayerSandboxReadiness();
    const serialised = JSON.stringify(readiness);

    expect(readiness.mode).toBe("live");
    expect(readiness.sandboxClientIdInLiveMode).toBe(true);
    expect(readiness.clientIdConfigured).toBe(true);
    expect(readiness.safeMessage).toContain('starts with "sandbox-"');
    // Never leak secret values.
    expect(serialised).not.toContain("live-secret-value");
    expect(serialised).not.toContain("sandbox-leftover-id");
    expect(serialised).not.toContain("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  });

  it("reports sandbox mode by default", () => {
    const readiness = getTrueLayerSandboxReadiness({} as NodeJS.ProcessEnv);
    expect(readiness.mode).toBe("sandbox");
    expect(readiness.sandboxClientIdInLiveMode).toBe(false);
  });
});

describe("Connected Accounts UI is mode-aware", () => {
  it("sandbox mode shows sandbox labels", () => {
    const readiness = getTrueLayerSandboxReadiness({} as NodeJS.ProcessEnv);
    const html = renderManager(readiness);
    expect(html).toContain("Start sandbox connection");
    expect(html).toContain("TrueLayer sandbox readiness");
    expect(html).toContain("TrueLayer sandbox");
  });

  it("live mode shows live labels and not sandbox ones", () => {
    const readiness = getTrueLayerSandboxReadiness(liveEnv);
    const html = renderManager(readiness);
    expect(html).toContain("Start live connection");
    expect(html).toContain("TrueLayer live readiness");
    expect(html).not.toContain("Start sandbox connection");
    expect(html).not.toContain("TrueLayer sandbox readiness");
  });

  it("live mode surfaces the sandbox- client ID warning and never renders secrets", () => {
    const readiness = getTrueLayerSandboxReadiness({
      ...liveEnv,
      TRUELAYER_CLIENT_ID: "sandbox-leftover-id",
    } as unknown as NodeJS.ProcessEnv);
    const html = renderManager(readiness);
    expect(html).toContain('still starts with');
    expect(html).not.toContain("live-secret-value");
    expect(html).not.toContain("sandbox-leftover-id");
  });

  it("labels existing sandbox connections as sandbox", () => {
    const readiness = getTrueLayerSandboxReadiness(liveEnv); // app in live mode
    const sandboxConnection: BankConnection = {
      id: "conn_old_sandbox",
      provider: "truelayer",
      institutionName: "TrueLayer sandbox",
      institutionId: "truelayer_sandbox",
      status: "connected",
      consentStatus: "active",
      consentStartedAt: "2026-06-01T00:00:00.000Z",
      consentExpiresAt: "2026-09-01T00:00:00.000Z",
      lastSyncedAt: "2026-06-02T00:00:00.000Z",
      errorMessage: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    };
    const html = renderManager(readiness, [sandboxConnection]);
    // Even though the app is live, the old connection is still labelled sandbox.
    expect(html).toContain("TrueLayer sandbox");
  });
});

describe("TrueLayer live connections are created separately from sandbox", () => {
  it("creates a live connection record in live mode and a sandbox record in sandbox mode", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const sandboxProvider = new TrueLayerProvider(sandboxConfig);
    const sandboxStart = await sandboxProvider.createConnection({
      userId: "user_1",
      institutionId: "ignored",
      institutionName: "ignored",
    });
    expect(sandboxStart.connection.institutionId).toBe("truelayer_sandbox");
    expect(sandboxStart.connection.institutionName).toBe("TrueLayer sandbox");

    const liveProvider = new TrueLayerProvider(liveConfig);
    const liveStart = await liveProvider.createConnection({
      userId: "user_1",
      institutionId: "ignored",
      institutionName: "ignored",
    });
    expect(liveStart.connection.institutionId).toBe("truelayer_live");
    expect(liveStart.connection.institutionName).toBe("TrueLayer live");

    // Separate connection ids -> separate token records -> no mixing.
    expect(liveStart.connection.id).not.toBe(sandboxStart.connection.id);

    // No secret ever logged during connection start.
    const logged = infoSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain("live-secret-value");
    expect(logged).not.toContain("sandbox-secret-value");
  });
});
