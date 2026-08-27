import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SessionStore,
  createSessionId,
  deriveApplicationName,
} from "../../src/sessions/store.js";
import type { ExplorationSession } from "../../src/sessions/types.js";
import { UserStore } from "../../src/auth/user-store.js";
import { describeDb, setupTestDb } from "../helpers/db.js";

describe("deriveApplicationName", () => {
  it("uses page title when available", () => {
    expect(deriveApplicationName("https://crm.company.com", "CRM Portal | Login")).toBe(
      "CRM Portal",
    );
  });

  it("falls back to subdomain then domain", () => {
    expect(deriveApplicationName("https://crm.company.com")).toBe("Crm Application");
    expect(deriveApplicationName("https://www.example.com")).toBe("Example Application");
  });
});

describeDb("SessionStore (postgres)", () => {
  let dataRoot: string;
  let store: SessionStore;
  let ownerUserId: string;
  let cleanup: () => Promise<void> = async () => undefined;

  beforeEach(async () => {
    const ctx = await setupTestDb();
    dataRoot = ctx.dataRoot;
    cleanup = ctx.cleanup;
    const users = new UserStore(ctx.db);
    const owner = await users.create({
      username: "owner",
      passwordHash: "x",
      salt: "y",
      role: "admin",
    });
    ownerUserId = owner.id;
    store = new SessionStore(dataRoot, ctx.db);
  });

  afterEach(async () => {
    await cleanup();
  });

  function baseSession(id: string, patch: Partial<ExplorationSession> = {}): ExplorationSession {
    const now = new Date().toISOString();
    return {
      id,
      applicationName: "Demo App",
      applicationUrl: "https://example.com",
      username: "explorer",
      framework: "playwright",
      status: "completed",
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      completedAt: now,
      statistics: { pages: 3, elements: 12, actions: 8, flows: 2, skipped: 1 },
      contextPath: store.contextDir(id),
      memoryPath: store.memoryDir(id),
      ownerUserId,
      ...patch,
    };
  }

  it("persists sessions without passwords and isolates context paths", async () => {
    const id = createSessionId();
    await store.ensureSession(id);
    await store.saveSession(baseSession(id));
    await store.appendEvent(id, {
      id: "evt-1",
      sessionId: id,
      timestamp: new Date().toISOString(),
      type: "browser_initialized",
      title: "Browser Initialization",
      status: "success",
    });

    const loaded = await store.loadSession(id);
    expect(loaded).toMatchObject({
      id,
      applicationName: "Demo App",
      username: "explorer",
      statistics: { pages: 3 },
      ownerUserId,
    });
    expect(loaded).not.toHaveProperty("password");

    const events = await store.loadEvents(id);
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Browser Initialization");

    const listed = await store.listSessions();
    expect(listed.map((s) => s.id)).toContain(id);
    expect(store.contextDir(id)).toContain(id);
    expect(store.memoryDir(id)).toContain(id);
  });

  it("keeps two sessions isolated on disk and in db", async () => {
    const a = createSessionId();
    const b = createSessionId();
    await store.ensureSession(a);
    await store.ensureSession(b);
    await store.saveSession(baseSession(a, { applicationName: "App A", applicationUrl: "https://a.example.com", framework: "independent", statistics: { pages: 1, elements: 1, actions: 1, flows: 0, skipped: 0 } }));
    await store.saveSession(baseSession(b, { applicationName: "App B", applicationUrl: "https://b.example.com", framework: "selenium-java", statistics: { pages: 9, elements: 9, actions: 9, flows: 1, skipped: 0 } }));

    const loadedA = await store.loadSession(a);
    const loadedB = await store.loadSession(b);
    expect(loadedA?.applicationName).toBe("App A");
    expect(loadedB?.statistics.pages).toBe(9);
    expect(loadedA?.contextPath).not.toBe(loadedB?.contextPath);
  });

  it("survives concurrent session writes", async () => {
    const id = createSessionId();
    await store.ensureSession(id);
    const base = baseSession(id, { status: "exploring", statistics: { pages: 0, elements: 0, actions: 0, flows: 0, skipped: 0 } });
    await store.saveSession(base);

    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        store.saveSession({
          ...base,
          statistics: { pages: i, elements: i * 2, actions: i, flows: 0, skipped: 0 },
        }),
      ),
    );

    const loaded = await store.loadSession(id);
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(id);
    expect(typeof loaded?.statistics.pages).toBe("number");
  });

  it("clears context documents and can delete a session", async () => {
    const id = createSessionId();
    await store.ensureSession(id);
    await store.saveSession(baseSession(id, { applicationName: "Temp", framework: "independent", statistics: { pages: 1, elements: 1, actions: 0, flows: 0, skipped: 0 } }));
    await writeFile(path.join(store.contextDir(id), "pages.md"), "# Pages\n", "utf8");
    expect(await store.documentExists(id, "pages.md")).toBe(true);

    const removed = await store.clearContext(id);
    expect(removed).toBeGreaterThan(0);
    expect(await store.documentExists(id, "pages.md")).toBe(false);

    await store.deleteSession(id);
    expect(await store.loadSession(id)).toBeNull();
  });

  it("persists exploration runs and next run ids; clears events on resume pattern", async () => {
    const id = createSessionId();
    await store.ensureSession(id);
    await store.saveSession(baseSession(id));
    const now = new Date().toISOString();
    await store.saveRun({
      id: "exploration-001",
      sessionId: id,
      type: "initial",
      startedAt: now,
      completedAt: now,
      status: "completed",
      statistics: {
        pagesDiscovered: 2,
        pagesAdded: 0,
        pagesRemoved: 0,
        elementsDiscovered: 5,
        elementsAdded: 0,
        elementsRemoved: 0,
        selectorsChanged: 0,
        flowsAdded: 0,
        flowsChanged: 0,
      },
    });
    await store.appendEvent(id, {
      id: "evt-old",
      sessionId: id,
      timestamp: now,
      type: "page_discovered",
      title: "Old",
      status: "new",
    });
    await store.clearEvents(id);
    expect(await store.loadEvents(id)).toHaveLength(0);

    const runs = await store.listRuns(id);
    expect(runs).toHaveLength(1);
    expect(await store.nextRunId(id)).toBe("exploration-002");
  });
});
