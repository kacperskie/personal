import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "../middleware";
import {
  getFirebaseAdminEnv,
  isFirebasePrivateKeyMalformed,
  normaliseFirebasePrivateKey,
} from "../src/lib/firebase/env";
import { createFirebaseAdminAuth } from "../src/lib/firebase/admin";
import { buildSystemReadinessReport } from "../src/lib/deployment/readiness";
import SignInPage from "../src/app/sign-in/page";

const PEM = "-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----\\n";

const firebaseEnv = {
  BACKEND_PROVIDER: "firebase",
  NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-public-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "finance-hq.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "finance-hq",
  NEXT_PUBLIC_FIREBASE_APP_ID: "firebase-app-id",
  FIREBASE_PROJECT_ID: "finance-hq",
  FIREBASE_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\\nadminsecret\\n-----END PRIVATE KEY-----\\n`,
  APP_BASE_URL: "https://finance-hq-staging.netlify.app",
  CRON_SECRET: "cron-secret-value",
} as unknown as NodeJS.ProcessEnv;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("phase 14 Firebase Admin Netlify runtime safety", () => {
  it("does not import Firebase Admin (or admin-importing helpers) in middleware", () => {
    const source = fs.readFileSync(path.resolve("middleware.ts"), "utf8");

    expect(source).not.toContain("firebase-admin");
    expect(source).not.toContain("firebase/admin");
    expect(source).not.toContain("firebase/session");
    expect(source).not.toContain("route-auth");
  });

  it("allows mock mode through middleware without redirecting", async () => {
    vi.stubEnv("BACKEND_PROVIDER", "mock");

    const response = await middleware(
      new NextRequest(new URL("http://localhost/dashboard")),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects protected routes to /sign-in when no Firebase cookie exists", async () => {
    vi.stubEnv("BACKEND_PROVIDER", "firebase");

    const response = await middleware(
      new NextRequest(new URL("http://localhost/dashboard")),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/sign-in");
  });

  it("loads firebase-admin lazily with dynamic import only", () => {
    const source = fs.readFileSync(
      path.resolve("src/lib/firebase/admin.ts"),
      "utf8",
    );

    // No static value imports of firebase-admin subpackages.
    expect(source).not.toMatch(/^import \{[^}]*\} from "firebase-admin\//m);
    // Lazy dynamic imports must be present.
    expect(source).toContain('await import("firebase-admin/app")');
    expect(source).toContain('await import("firebase-admin/auth")');
    expect(source).toContain('await import("firebase-admin/firestore")');
  });

  it("returns null from the Admin helper without env and without throwing", async () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");
    vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");

    await expect(createFirebaseAdminAuth()).resolves.toBeNull();
  });

  it("normalises escaped-newline private keys", () => {
    const env = getFirebaseAdminEnv(firebaseEnv);
    expect(env?.privateKey).toContain("\nadminsecret\n");
    expect(env?.privateKey).not.toContain("\\nadminsecret\\n");
  });

  it("strips surrounding quotes from a private key", () => {
    const doubleQuoted = `"${PEM}"`;
    const singleQuoted = `'${PEM}'`;

    expect(normaliseFirebasePrivateKey(doubleQuoted)).toBe(
      "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n",
    );
    expect(normaliseFirebasePrivateKey(singleQuoted)).not.toContain("'");
    expect(normaliseFirebasePrivateKey(singleQuoted)).toContain("\nabc123\n");
  });

  it("flags a malformed private key without initialising Admin", () => {
    expect(
      isFirebasePrivateKeyMalformed({
        FIREBASE_PRIVATE_KEY: "not-a-real-pem-key",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isFirebasePrivateKeyMalformed({
        FIREBASE_PRIVATE_KEY: PEM,
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("renders /sign-in safely when Firebase Admin/client env is missing", () => {
    vi.stubEnv("BACKEND_PROVIDER", "firebase");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "");

    const html = renderToStaticMarkup(<SignInPage />);

    expect(html).toContain(
      "Firebase sign-in is not fully configured. Check Netlify environment variables.",
    );
  });

  it("exports the Node.js runtime from the Firebase session API route", async () => {
    const mod = await import("../src/app/api/auth/firebase-session/route");
    expect(mod.runtime).toBe("nodejs");
  });

  it("builds readiness with a malformed key without crashing and reports it safely", () => {
    const report = buildSystemReadinessReport({
      ...firebaseEnv,
      FIREBASE_PRIVATE_KEY: "not-a-pem-key",
    } as unknown as NodeJS.ProcessEnv);
    const adminCheck = report.checks.find((entry) => entry.id === "firebase_admin");
    const clientCheck = report.checks.find((entry) => entry.id === "firebase_client");

    expect(adminCheck?.status).toBe("warning");
    expect(adminCheck?.safeDetails).toContain("PEM");
    expect(clientCheck).toBeDefined();
    // No Supabase item should reappear as a primary check.
    expect(report.checks.some((entry) => entry.label.includes("Supabase"))).toBe(false);
    // No secret values are leaked into the report.
    expect(JSON.stringify(report)).not.toContain("not-a-pem-key");
  });
});
