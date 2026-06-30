import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFirebasePublicConfigDiagnostics,
  isFirebasePublicConfigComplete,
} from "../src/lib/firebase/diagnostics";
import SignInPage from "../src/app/sign-in/page";
import SystemReadinessPage from "../src/app/settings/system-readiness/page";

const PUBLIC_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("phase 15 Firebase public config diagnostics", () => {
  it("reports present/missing for every public key without exposing values", () => {
    const diagnostics = getFirebasePublicConfigDiagnostics({
      NEXT_PUBLIC_FIREBASE_API_KEY: "super-secret-api-key-value",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "finance-hq",
    } as unknown as NodeJS.ProcessEnv);

    expect(diagnostics.map((d) => d.name)).toEqual(PUBLIC_KEYS);
    expect(diagnostics.find((d) => d.name === "NEXT_PUBLIC_FIREBASE_API_KEY")?.present).toBe(true);
    expect(diagnostics.find((d) => d.name === "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN")?.present).toBe(
      false,
    );
    // Only name + boolean present, never the actual value.
    expect(JSON.stringify(diagnostics)).not.toContain("super-secret-api-key-value");
    for (const item of diagnostics) {
      expect(typeof item.present).toBe("boolean");
    }
  });

  it("treats config as complete only when required keys are present", () => {
    expect(
      isFirebasePublicConfigComplete({
        NEXT_PUBLIC_FIREBASE_API_KEY: "a",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "b",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "c",
        NEXT_PUBLIC_FIREBASE_APP_ID: "d",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isFirebasePublicConfigComplete({
        NEXT_PUBLIC_FIREBASE_API_KEY: "a",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("client initialiser reads literal NEXT_PUBLIC_* (so Next inlines them)", () => {
    const source = fs.readFileSync(
      path.resolve("src/lib/firebase/client.ts"),
      "utf8",
    );

    for (const key of PUBLIC_KEYS) {
      expect(source).toContain(`process.env.${key}`);
    }
    // Must not read the browser config through the aliased server helper.
    expect(source).not.toContain("getFirebaseBrowserEnv");
  });

  it("renders the safe diagnostic on /sign-in when Firebase config is missing", () => {
    vi.stubEnv("BACKEND_PROVIDER", "firebase");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "");

    const html = renderToStaticMarkup(<SignInPage />);

    for (const key of PUBLIC_KEYS) {
      expect(html).toContain(key);
    }
    expect(html).toContain("missing");
  });

  it("does not render actual Firebase values on /sign-in", () => {
    vi.stubEnv("BACKEND_PROVIDER", "firebase");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "leaky-api-key-should-not-appear");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "");

    const html = renderToStaticMarkup(<SignInPage />);

    expect(html).not.toContain("leaky-api-key-should-not-appear");
  });

  it("renders the safe diagnostic on /settings/system-readiness", () => {
    vi.stubEnv("BACKEND_PROVIDER", "firebase");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");

    const html = renderToStaticMarkup(<SystemReadinessPage />);

    for (const key of PUBLIC_KEYS) {
      expect(html).toContain(key);
    }
  });
});
