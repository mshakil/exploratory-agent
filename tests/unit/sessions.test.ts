import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  SessionStore,
  createSessionId,
  deriveApplicationName,
} from "../../src/sessions/store.js";
import type { ExplorationSession } from "../../src/sessions/types.js";

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

describe("SessionStore", () => {
  let root: string;
  let store: SessionStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "ae-sessions-"));
    store = new SessionStore(path.join(root, "sessions"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("persists sessions without passwords and isolates context paths", async () => {
    const id = createSessionId();
    await store.ensureSession(id);

    const now = new Date().toISOString();
    const session: ExplorationSession = {
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
      statistics: { pages: 3, elements: 12, actions: 8, flows: 2 },
      contextPath: store.contextDir(id),
      memoryPath: store.memoryDir(id),
    };

    await store.saveSession(session);
    await store.saveEvents(id, [
      {
        id: "evt-1",
        sessionId: id,
        timestamp: new Date().toISOString(),
        type: "browser_initialized",
        title: "Browser Initialization",
        status: "success",
      },
    ]);

    const loaded = await store.loadSession(id);
    expect(loaded).toMatchObject({
      id,
      applicationName: "Demo App",
      username: "explorer",
      statistics: { pages: 3 },
    });
    expect(loaded).not.toHaveProperty("password");

    const raw = await readFile(path.join(store.sessionDir(id), "session.json"), "utf8");
    expect(raw).not.toMatch(/password/i);

    const events = await store.loadEvents(id);
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Browser Initialization");

    const listed = await store.listSessions();
    expect(listed.map((s) => s.id)).toContain(id);
    expect(store.contextDir(id)).toContain(id);
    expect(store.memoryDir(id)).toContain(id);
  });

  it("keeps two sessions isolated on disk", async () => {
    const a = createSessionId();
    const b = createSessionId();
    await store.ensureSession(a);
    await store.ensureSession(b);

    const now = new Date().toISOString();
    await store.saveSession({
      id: a,
      applicationName: "App A",
      applicationUrl: "https://a.example.com",
      framework: "independent",
      status: "completed",
      createdAt: now,
      updatedAt: now,
      statistics: { pages: 1, elements: 1, actions: 1, flows: 0 },
      contextPath: store.contextDir(a),
      memoryPath: store.memoryDir(a),
    });
    await store.saveSession({
      id: b,
      applicationName: "App B",
      applicationUrl: "https://b.example.com",
      framework: "selenium-java",
      status: "completed",
      createdAt: now,
      updatedAt: now,
      statistics: { pages: 9, elements: 9, actions: 9, flows: 1 },
      contextPath: store.contextDir(b),
      memoryPath: store.memoryDir(b),
    });

    const loadedA = await store.loadSession(a);
    const loadedB = await store.loadSession(b);
    expect(loadedA?.applicationName).toBe("App A");
    expect(loadedB?.statistics.pages).toBe(9);
    expect(loadedA?.contextPath).not.toBe(loadedB?.contextPath);
  });

  it("survives concurrent session writes without corrupting JSON", async () => {
    const id = createSessionId();
    await store.ensureSession(id);
    const now = new Date().toISOString();
    const base = {
      id,
      applicationName: "Concurrent App",
      applicationUrl: "https://example.com",
      framework: "independent" as const,
      status: "exploring" as const,
      createdAt: now,
      updatedAt: now,
      statistics: { pages: 0, elements: 0, actions: 0, flows: 0 },
      contextPath: store.contextDir(id),
      memoryPath: store.memoryDir(id),
    };
    await store.saveSession(base);

    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        store.saveSession({
          ...base,
          statistics: { pages: i, elements: i * 2, actions: i, flows: 0 },
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
    const now = new Date().toISOString();
    await store.saveSession({
      id,
      applicationName: "Temp",
      applicationUrl: "https://example.com",
      framework: "independent",
      status: "completed",
      createdAt: now,
      updatedAt: now,
      statistics: { pages: 1, elements: 1, actions: 0, flows: 0 },
      contextPath: store.contextDir(id),
      memoryPath: store.memoryDir(id),
    });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(store.contextDir(id), "pages.md"), "# Pages\n", "utf8");
    expect(await store.documentExists(id, "pages.md")).toBe(true);

    const removed = await store.clearContext(id);
    expect(removed).toBeGreaterThan(0);
    expect(await store.documentExists(id, "pages.md")).toBe(false);

    await store.deleteSession(id);
    expect(await store.loadSession(id)).toBeNull();
  });

  it("persists exploration runs and next run ids", async () => {
    const id = createSessionId();
    await store.ensureSession(id);
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
    const runs = await store.listRuns(id);
    expect(runs).toHaveLength(1);
    expect(await store.nextRunId(id)).toBe("exploration-002");
  });
});
