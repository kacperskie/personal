// TEMPORARY — remove together with src/app/api/debug/env-visibility/route.ts
// once the sign-in diagnostic is complete.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/debug/env-visibility/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public env-visibility diagnostic", () => {
  it("reports present/empty/length without ever leaking secret values", async () => {
    const fakeKey = "totally-not-a-real-private-key-value-1234567890";
    const fakeEmail = "svc@demo-project.iam.gserviceaccount.com";
    vi.stubEnv("BACKEND_PROVIDER", "firebase");
    vi.stubEnv("FIREBASE_PROJECT_ID", "demo-project");
    vi.stubEnv("FIREBASE_CLIENT_EMAIL", fakeEmail);
    vi.stubEnv("FIREBASE_PRIVATE_KEY", fakeKey);

    const response = await GET();
    const body = await response.json();
    const serialised = JSON.stringify(body);

    expect(response.status).toBe(200);

    const pk = body.envVisibility.find(
      (entry: { name: string }) => entry.name === "FIREBASE_PRIVATE_KEY",
    );
    expect(pk.present).toBe(true);
    expect(pk.empty).toBe(false);
    expect(pk.length).toBe(fakeKey.length);

    // The whole point: booleans/lengths only, never the values themselves.
    expect(serialised).not.toContain(fakeKey);
    expect(serialised).not.toContain(fakeEmail);

    // A non-PEM value means Admin init is not even attempted (no network).
    expect(body.adminInit).toBe("not_tested");
    expect(body.firebaseBackendSelected).toBe(true);
    // Two-signal model: adminEnvResolves is true because all three values are
    // PRESENT (this is the gate that early-returns null when a value is missing —
    // the ~237ms no-network symptom). adminInit stays not_tested because the key
    // is not a PEM, so init is never attempted. Present-but-malformed vs missing
    // are therefore distinguishable on the host.
    expect(body.adminEnvResolves).toBe(true);
  });

  it("flags an empty (present-but-blank) var distinctly from a populated one", async () => {
    vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");

    const response = await GET();
    const body = await response.json();
    const email = body.envVisibility.find(
      (entry: { name: string }) => entry.name === "FIREBASE_CLIENT_EMAIL",
    );

    expect(email.present).toBe(true);
    expect(email.empty).toBe(true);
    expect(email.length).toBe(0);
  });
});
