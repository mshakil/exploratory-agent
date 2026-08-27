import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { AuthService } from "../../src/auth/index.js";
import { SessionManager } from "../../src/sessions/manager.js";
import type { ExplorationSession } from "../../src/sessions/types.js";
import { SessionStore, createSessionId } from "../../src/sessions/store.js";
import { UserStore } from "../../src/auth/user-store.js";
import { describeDb, setupTestDb } from "../helpers/db.js";

describeDb("UserStore / AuthService (postgres)", () => {
  let auth: AuthService;
  let cleanup: () => Promise<void> = async () => undefined;

  beforeEach(async () => {
    const ctx = await setupTestDb();
    cleanup = ctx.cleanup;
    auth = new AuthService(ctx.db);
    await auth.init();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("registers first user as admin and rejects duplicate usernames", async () => {
    const first = await auth.register("alice", "password123");
    expect(first.role).toBe("admin");
    const second = await auth.register("bob", "password123");
    expect(second.role).toBe("user");
    await expect(auth.register("Alice", "password123")).rejects.toThrow(/taken/i);
  });

  it("logs in with correct credentials only", async () => {
    await auth.register("carol", "password123");
    const user = await auth.login("carol", "password123");
    expect(user.username).toBe("carol");
    await expect(auth.login("carol", "nope")).rejects.toThrow(/Invalid/);
  });
});

describeDb("session ownership filtering (postgres)", () => {
  let manager: SessionManager;
  let store: SessionStore;
  let users: UserStore;
  let cleanup: () => Promise<void> = async () => undefined;

  beforeEach(async () => {
    const ctx = await setupTestDb();
    cleanup = ctx.cleanup;
    manager = new SessionManager(ctx.dataRoot, ctx.db);
    store = new SessionStore(ctx.dataRoot, ctx.db);
    users = new UserStore(ctx.db);
  });

  afterEach(async () => {
    await cleanup();
  });

  async function seed(ownerUserId: string): Promise<ExplorationSession> {
    const id = createSessionId();
    await store.ensureSession(id);
    const now = new Date().toISOString();
    const session: ExplorationSession = {
      id,
      applicationName: "Demo",
      applicationUrl: "https://example.com",
      framework: "independent",
      status: "completed",
      createdAt: now,
      updatedAt: now,
      statistics: { pages: 0, elements: 0, actions: 0, flows: 0, skipped: 0 },
      contextPath: store.contextDir(id),
      memoryPath: store.memoryDir(id),
      ownerUserId,
    };
    await store.saveSession(session);
    return session;
  }

  it("lists only owned sessions for a user; admin filter sees all", async () => {
    const ua = await users.create({
      username: "usera",
      passwordHash: "x",
      salt: "y",
      role: "user",
    });
    const ub = await users.create({
      username: "userb",
      passwordHash: "x",
      salt: "y",
      role: "user",
    });
    const a = await seed(ua.id);
    const b = await seed(ub.id);

    const forA = await manager.listSessions({ ownerUserId: ua.id });
    expect(forA.map((s) => s.id)).toEqual([a.id]);

    const forB = await manager.listSessions({ ownerUserId: ub.id });
    expect(forB.map((s) => s.id)).toEqual([b.id]);

    const admin = await manager.listSessions({ admin: true });
    const ids = admin.map((s) => s.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });

  it("AuthService.canAccessSession enforces ownership", async () => {
    const ctx = await setupTestDb();
    const auth = new AuthService(ctx.db);
    await auth.init();
    const owner = await auth.register("owner", "password123");
    const other = await auth.register("other", "password123");

    expect(auth.canAccessSession(owner, { ownerUserId: owner.id })).toBe(true);
    expect(auth.canAccessSession(other, { ownerUserId: owner.id })).toBe(false);
    expect(auth.canAccessSession(other, {})).toBe(false);
    expect(auth.canAccessSession(owner, {})).toBe(true); // admin (first user)

    await ctx.cleanup();
  });
});
