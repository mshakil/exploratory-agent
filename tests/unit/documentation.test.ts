import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { generateDocumentation, buildApplicationContext } from "../../src/documentation/index.js";
import { renderFrameworkMd } from "../../src/frameworks/index.js";
import { SchemaVersion } from "../../src/models/index.js";

describe("documentation + frameworks", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ae-docs-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("generates CONTEXT.md, AGENTS.md, and playwright framework doc", async () => {
    const context = buildApplicationContext({
      application: { name: "Shop", baseUrl: "https://shop.example.com" },
      pages: [
        {
          id: "p1",
          name: "Home",
          url: "https://shop.example.com/",
          status: "COMPLETED",
          stateFingerprint: "x",
          timestamp: new Date().toISOString(),
          elementIds: ["e1"],
        },
      ],
      elements: [
        {
          id: "e1",
          name: "Login",
          type: "button",
          attributes: { "data-testid": "login" },
          selectors: {
            preferred: { strategy: "testId", value: "login", rank: 1 },
            fallbacks: [{ strategy: "role", role: "button", name: "Login", rank: 2 }],
          },
          pageId: "p1",
          confidence: "high",
        },
      ],
      flows: [],
      transitions: [],
      actions: [],
      exploration: {
        startedAt: new Date().toISOString(),
        status: "completed",
        pagesDiscovered: 1,
        elementsDiscovered: 1,
        flowsDiscovered: 0,
        selectorsCaptured: 1,
        skippedActions: 0,
        blockedStates: 0,
        failedActions: 0,
      },
    });

    expect(context.schemaVersion).toBe(SchemaVersion);

    await generateDocumentation(context, dir, {
      framework: "playwright",
      applicationName: "Shop",
      applicationUrl: "https://shop.example.com",
      status: "completed",
      statistics: { pages: 1, elements: 1, actions: 0, flows: 0 },
      runs: [
        {
          id: "exploration-001",
          sessionId: "s1",
          type: "initial",
          startedAt: new Date().toISOString(),
          status: "completed",
          statistics: {
            pagesDiscovered: 1,
            pagesAdded: 0,
            pagesRemoved: 0,
            elementsDiscovered: 1,
            elementsAdded: 0,
            elementsRemoved: 0,
            selectorsChanged: 0,
            flowsAdded: 0,
            flowsChanged: 0,
          },
        },
      ],
    });

    const contextMd = await readFile(path.join(dir, "CONTEXT.md"), "utf8");
    expect(contextMd).toContain("# Application Automation Context");
    expect(contextMd).toContain("application.md");
    expect(contextMd).toContain("framework/playwright.md");
    expect(contextMd).toContain("Playwright");
    expect(contextMd).toContain("How to Use");

    const agents = await readFile(path.join(dir, "AGENTS.md"), "utf8");
    expect(agents).toContain("CONTEXT.md");
    expect(agents).toContain("application.json");

    await access(path.join(dir, "framework", "playwright.md"));
    const fw = await readFile(path.join(dir, "framework", "playwright.md"), "utf8");
    expect(fw).toContain("getByTestId");
  });

  it("maps selectors to Selenium Java", () => {
    const md = renderFrameworkMd(
      {
        schemaVersion: SchemaVersion,
        application: { name: "A", baseUrl: "https://a.test" },
        pages: [],
        elements: [],
        flows: [],
        selectors: [
          {
            elementId: "e1",
            elementName: "Save",
            pageId: "p1",
            confidence: "high",
            selectors: {
              preferred: { strategy: "testId", value: "save", rank: 1 },
              fallbacks: [],
            },
          },
        ],
        transitions: [],
        actions: [],
        exploration: {
          startedAt: new Date().toISOString(),
          status: "completed",
          pagesDiscovered: 0,
          elementsDiscovered: 0,
          flowsDiscovered: 0,
          selectorsCaptured: 1,
          skippedActions: 0,
          blockedStates: 0,
          failedActions: 0,
        },
      },
      "selenium-java",
    );
    expect(md).toContain("By.cssSelector");
    expect(md).toContain("data-testid");
  });
});
