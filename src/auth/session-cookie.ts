import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthSessionPayload } from "./types.js";

export const COOKIE_NAME = "ae_sid";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Resolve cookie HMAC secret from AE_SESSION_SECRET.
 * For local/dev, generates an ephemeral secret if unset (sessions reset on restart).
 * Production should always set AE_SESSION_SECRET (>= 16 chars).
 */
export function resolveSessionSecret(): string {
  const fromEnv = process.env.AE_SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AE_SESSION_SECRET is required in production (min 16 characters)",
    );
  }

  const generated = randomBytes(32).toString("hex");
  console.warn(
    "[auth] AE_SESSION_SECRET unset — using ephemeral secret for this process only",
  );
  process.env.AE_SESSION_SECRET = generated;
  return generated;
}

export function signSession(payload: AuthSessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string, secret: string): AuthSessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthSessionPayload;
    if (!payload.userId || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(userId: string, secret: string, ttlMs = SESSION_TTL_MS): string {
  return signSession({ userId, exp: Date.now() + ttlMs }, secret);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function buildSetCookie(
  token: string | null,
  opts: { secure: boolean; maxAgeSec?: number },
): string {
  if (token === null) {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${opts.secure ? "; Secure" : ""}`;
  }
  const maxAge = opts.maxAgeSec ?? Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    opts.secure ? "; Secure" : ""
  }`;
}

export function shouldUseSecureCookie(reqSecureHint: boolean): boolean {
  if (process.env.AE_COOKIE_SECURE === "1") return true;
  if (process.env.AE_COOKIE_SECURE === "0") return false;
  return reqSecureHint;
}
