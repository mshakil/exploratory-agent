import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Explorer } from "../../src/explorer/index.js";
import { DEFAULT_BOUNDARIES, DEFAULT_TEST_DATA } from "../../src/models/index.js";
import { classifyAction } from "../../src/discovery/action-classifier.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoHtmlPath = path.resolve(__dirname, "../../demo/index.html");

describe("browser integration against demo app", () => {
  let server: Server;
  let baseUrl: string;
  let workDir: string;

  beforeAll(async () => {
    const html = await readFile(demoHtmlPath);
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("No server address");
    baseUrl = `http://127.0.0.1:${addr.port}`;
    workDir = await mkdtemp(path.join(tmpdir(), "agent-explorer-e2e-"));
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await rm(workDir, { recursive: true, force: true });
  });

  it("explores the demo CRM and generates application context", async () => {
    const output = path.join(workDir, "application-context");
    const memoryDir = path.join(workDir, ".memory");

    const explorer = new Explorer({
      url: baseUrl,
      output,
      memoryDir,
      headless: true,
      json: true,
      verbose: false,
      username: "sdet",
      password: "secret",
      boundaries: {
        ...DEFAULT_BOUNDARIES,
        maxPages: 8,
        maxDepth: 3,
        maxActionsPerPage: 6,
        timeoutMs: 2_000,
        maxDurationMs: 35_000,
      },
      testData: DEFAULT_TEST_DATA,
    });

    const result = await explorer.run(false);

    expect(result.exploration.status).toBe("completed");
    expect(result.exploration.pagesDiscovered).toBeGreaterThanOrEqual(2);
    expect(result.exploration.elementsDiscovered).toBeGreaterThanOrEqual(3);

    const appJson = JSON.parse(await readFile(path.join(output, "application.json"), "utf8"));
    expect(appJson.schemaVersion).toBe("1.0");
    expect(appJson.pages.length).toBeGreaterThanOrEqual(2);

    const pageNames = appJson.pages.map((p: { name: string }) => p.name.toLowerCase()).join(" ");
    expect(pageNames).toMatch(/dashboard|users|login|settings|reports|create|demo/i);

    // Destructive actions should not be executed when discovered
    const destructiveExecuted = (appJson.actions || []).filter(
      (a: { elementName: string; status: string }) =>
        classifyAction({ name: a.elementName }) === "destructive" && a.status === "EXECUTED",
    );
    expect(destructiveExecuted).toHaveLength(0);

    // No raw credentials in output
    const raw = await readFile(path.join(output, "application.json"), "utf8");
    expect(raw).not.toContain('"secret"');

    const agents = await readFile(path.join(output, "AGENTS.md"), "utf8");
    expect(agents).toContain("Read application.md");

    // Selectors should prefer test ids where available
    const withTestId = (
      appJson.elements as Array<{ selectors: { preferred: { strategy: string } } }>
    ).filter((e) => e.selectors.preferred.strategy === "testId");
    expect(withTestId.length).toBeGreaterThan(0);
  }, 120_000);
});
