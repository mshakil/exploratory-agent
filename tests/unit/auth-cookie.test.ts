import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  signSession,
  verifySession,
} from "../../src/auth/session-cookie.js";

describe("session cookie", () => {
  const secret = "test-secret-at-least-16";

  it("signs and verifies a valid token", () => {
    const token = createSessionToken("user-1", secret, 60_000);
    const payload = verifySession(token, secret);
    expect(payload).toMatchObject({ userId: "user-1" });
    expect(payload!.exp).toBeGreaterThan(Date.now());
  });

  it("rejects tampered signatures", () => {
    const token = createSessionToken("user-1", secret);
    const [body] = token.split(".");
    expect(verifySession(`${body}.deadbeef`, secret)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = signSession({ userId: "user-1", exp: Date.now() - 1 }, secret);
    expect(verifySession(token, secret)).toBeNull();
  });
});
