import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";

describe("password hashing", () => {
  it("hashes and verifies matching passwords", async () => {
    const { hash, salt } = await hashPassword("correct-horse");
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(await verifyPassword("correct-horse", salt, hash)).toBe(true);
    expect(await verifyPassword("wrong-password", salt, hash)).toBe(false);
  });

  it("uses unique salts", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});
