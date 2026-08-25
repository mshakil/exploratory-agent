import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MemoryStore } from "../../src/memory/index.js";
import { ApplicationGraph } from "../../src/graph/index.js";
import { buildApplicationContext, generateDocumentation } from "../../src/documentation/index.js";
import { readFile } from "node:fs/promises";

describe("memory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "agent-explorer-mem-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists and restores exploration snapshots", async () => {
    const store = new MemoryStore(dir);
    await store.save({
      application: { name: "demo", baseUrl: "http://localhost" },
      pages: [
        {
          id: "users",
          name: "Users",
          url: "/users",
          status: "COMPLETED",
          stateFingerprint: "abc",
          timestamp: new Date().toISOString(),
          elementIds: [],
        },
      ],
      elements: [],
      flows: [],
      actions: [],
      transitions: [],
      exploration: {
        startedAt: new Date().toISOString(),
        status: "completed",
        pagesDiscovered: 1,
        elementsDiscovered: 0,
        flowsDiscovered: 0,
        selectorsCaptured: 0,
        skippedActions: 0,
        blockedStates: 0,
        failedActions: 0,
      },
      visitedFingerprints: ["abc"],
    });

    const loaded = await store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.pages).toHaveLength(1);
    expect(loaded!.pages[0]!.name).toBe("Users");
    expect(loaded!.visitedFingerprints).toContain("abc");
  });
});

describe("graph", () => {
  it("avoids duplicate pages for same fingerprint and records transitions", () => {
    const graph = new ApplicationGraph();
    const page = graph.addPage({
      id: "users-1",
      name: "Users",
      url: "/users",
      status: "DISCOVERED",
      stateFingerprint: "fp1",
      timestamp: new Date().toISOString(),
      elementIds: [],
    });
    const again = graph.addPage({
      id: "users-2",
      name: "Users",
      url: "/users",
      status: "DISCOVERED",
      stateFingerprint: "fp1",
      timestamp: new Date().toISOString(),
      elementIds: [],
    });
    expect(again.id).toBe(page.id);
    expect(graph.listPages()).toHaveLength(1);

    graph.addPage({
      id: "create-1",
      name: "Create User",
      url: "/users/create",
      status: "DISCOVERED",
      stateFingerprint: "fp2",
      timestamp: new Date().toISOString(),
      elementIds: [],
    });
    graph.addTransition({
      from: "users-1",
      action: { type: "click", element: "Create User" },
      to: "create-1",
    });
    expect(graph.listTransitions()).toHaveLength(1);
    expect(graph.getChildren("users-1")[0]?.name).toBe("Create User");
  });
});

describe("documentation", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "agent-explorer-docs-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("generates markdown and json outputs", async () => {
    const context = buildApplicationContext({
      application: { name: "demo", baseUrl: "http://localhost" },
      pages: [
        {
          id: "dashboard",
          name: "Dashboard",
          url: "/dashboard",
          status: "COMPLETED",
          stateFingerprint: "x",
          timestamp: new Date().toISOString(),
          elementIds: ["e1"],
        },
      ],
      elements: [
        {
          id: "e1",
          name: "Users",
          type: "link",
          attributes: {},
          selectors: {
            preferred: { strategy: "testId", value: "nav-users", rank: 100 },
            fallbacks: [],
          },
          pageId: "dashboard",
          confidence: "high",
        },
      ],
      flows: [
        {
          id: "go-users",
          name: "Navigate to Users",
          preconditions: [],
          steps: [{ order: 1, action: "click", element: "Users" }],
          resultingState: "Users",
        },
      ],
      transitions: [],
      actions: [],
      exploration: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "completed",
        pagesDiscovered: 1,
        elementsDiscovered: 1,
        flowsDiscovered: 1,
        selectorsCaptured: 1,
        skippedActions: 0,
        blockedStates: 0,
        failedActions: 0,
      },
    });

    const files = await generateDocumentation(context, dir);
    expect(files.some((f) => f.endsWith("application.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("AGENTS.md"))).toBe(true);

    const json = JSON.parse(await readFile(path.join(dir, "application.json"), "utf8"));
    expect(json.schemaVersion).toBe("1.0");
    expect(json.pages[0].name).toBe("Dashboard");

    const agents = await readFile(path.join(dir, "AGENTS.md"), "utf8");
    expect(agents).toContain("application.json");
  });
});
