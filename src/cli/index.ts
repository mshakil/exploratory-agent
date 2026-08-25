#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { Explorer, loadStatus } from "../explorer/index.js";
import {
  DEFAULT_BOUNDARIES,
  DEFAULT_TEST_DATA,
  type ExploreOptions,
} from "../models/index.js";
import { generateDocumentation, buildApplicationContext } from "../documentation/index.js";
import { extractFlows } from "../flows/index.js";
import { MemoryStore } from "../memory/index.js";
import { startUiServer } from "../server/index.js";

const program = new Command();

program
  .name("agent-explorer")
  .description(
    "Application Exploration Agent — discover UI structure, workflows, and selectors for SDETs",
  )
  .version("1.0.0");

function buildOptions(opts: Record<string, unknown>): ExploreOptions {
  const url = String(opts.url || "");
  if (!url) {
    throw new Error("--url is required");
  }

  const output = path.resolve(String(opts.output || "./application-context"));
  const memoryDir = path.resolve(String(opts.memory || "./.memory"));

  return {
    url,
    start: opts.start ? String(opts.start) : undefined,
    output,
    memoryDir,
    storageState: opts.storageState ? String(opts.storageState) : undefined,
    username: opts.username ? String(opts.username) : undefined,
    password: opts.password ? String(opts.password) : undefined,
    headless: opts.headless !== false && opts.headed !== true,
    json: Boolean(opts.json),
    verbose: Boolean(opts.verbose),
    boundaries: {
      maxPages: Number(opts.maxPages ?? DEFAULT_BOUNDARIES.maxPages),
      maxActionsPerPage: Number(
        opts.maxActionsPerPage ?? DEFAULT_BOUNDARIES.maxActionsPerPage,
      ),
      maxDepth: Number(opts.maxDepth ?? DEFAULT_BOUNDARIES.maxDepth),
      timeoutMs: Number(opts.timeout ?? DEFAULT_BOUNDARIES.timeoutMs),
      maxDurationMs: Number(opts.maxDuration ?? DEFAULT_BOUNDARIES.maxDurationMs),
      excludedUrls: opts.excludeUrl
        ? ([] as string[]).concat(opts.excludeUrl as string | string[])
        : [],
      excludedActions: opts.excludeAction
        ? ([] as string[]).concat(opts.excludeAction as string | string[])
        : [],
    },
    testData: { ...DEFAULT_TEST_DATA },
  };
}

program
  .command("explore")
  .description("Start an application exploration")
  .requiredOption("--url <url>", "Application base URL")
  .option("--start <path>", "Starting path or URL")
  .option("--output <dir>", "Output directory for application context", "./application-context")
  .option("--memory <dir>", "Memory directory", "./.memory")
  .option("--storage-state <file>", "Playwright storage state (authenticated session)")
  .option("--username <user>", "Simple credential login username")
  .option("--password <pass>", "Simple credential login password")
  .option("--max-pages <n>", "Maximum pages/states to explore", "50")
  .option("--max-depth <n>", "Maximum exploration depth", "8")
  .option("--max-actions-per-page <n>", "Maximum actions per page", "30")
  .option("--timeout <ms>", "Default interaction timeout", "10000")
  .option("--max-duration <ms>", "Wall-clock exploration budget", "300000")
  .option("--exclude-url <pattern>", "Excluded URL pattern (repeatable)", collect, [])
  .option("--exclude-action <name>", "Excluded action name substring (repeatable)", collect, [])
  .option("--headed", "Run browser headed (not headless)", false)
  .option("--json", "Emit machine-readable JSON summary", false)
  .option("--verbose", "Verbose operational logs", false)
  .action(async (opts) => {
    try {
      const options = buildOptions(opts);
      const explorer = new Explorer(options);
      await explorer.run(false);
    } catch (err) {
      fail(err, Boolean(opts.json));
    }
  });

program
  .command("resume")
  .description("Resume an interrupted exploration")
  .option("--url <url>", "Application base URL (required if memory lacks it)")
  .option("--output <dir>", "Output directory", "./application-context")
  .option("--memory <dir>", "Memory directory", "./.memory")
  .option("--storage-state <file>", "Playwright storage state")
  .option("--headed", "Run browser headed", false)
  .option("--json", "Machine-readable output", false)
  .option("--verbose", "Verbose logs", false)
  .option("--max-pages <n>", "Maximum pages", "50")
  .option("--max-depth <n>", "Maximum depth", "8")
  .action(async (opts) => {
    try {
      const memoryDir = path.resolve(String(opts.memory || "./.memory"));
      const store = new MemoryStore(memoryDir);
      const existing = await store.load();
      const url = opts.url || existing?.application.baseUrl;
      if (!url) {
        throw new Error("Provide --url or ensure .memory/exploration.json exists");
      }
      const options = buildOptions({ ...opts, url });
      const explorer = new Explorer(options);
      await explorer.run(true);
    } catch (err) {
      fail(err, Boolean(opts.json));
    }
  });

program
  .command("status")
  .description("Show current exploration state from memory")
  .option("--memory <dir>", "Memory directory", "./.memory")
  .option("--json", "Machine-readable output", false)
  .action(async (opts) => {
    try {
      const snapshot = await loadStatus(path.resolve(String(opts.memory || "./.memory")));
      if (!snapshot) {
        if (opts.json) {
          console.log(JSON.stringify({ status: "none" }));
        } else {
          console.log("No exploration memory found.");
        }
        return;
      }
      const payload = {
        status: snapshot.exploration.status,
        application: snapshot.application,
        pages: snapshot.pages.length,
        elements: snapshot.elements.length,
        flows: snapshot.flows.length,
        actions: snapshot.actions.length,
        skipped: snapshot.actions.filter((a) => a.status === "SKIPPED").length,
        failed: snapshot.actions.filter((a) => a.status === "FAILED").length,
        startedAt: snapshot.exploration.startedAt,
        completedAt: snapshot.exploration.completedAt,
      };
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log("Exploration status");
        console.log(`  Application: ${payload.application.name} (${payload.application.baseUrl})`);
        console.log(`  Status:      ${payload.status}`);
        console.log(`  Pages:       ${payload.pages}`);
        console.log(`  Elements:    ${payload.elements}`);
        console.log(`  Flows:       ${payload.flows}`);
        console.log(`  Actions:     ${payload.actions}`);
        console.log(`  Skipped:     ${payload.skipped}`);
        console.log(`  Failed:      ${payload.failed}`);
      }
    } catch (err) {
      fail(err, Boolean(opts.json));
    }
  });

program
  .command("report")
  .description("Generate documentation from stored knowledge")
  .option("--memory <dir>", "Memory directory", "./.memory")
  .option("--output <dir>", "Output directory", "./application-context")
  .option("--json", "Machine-readable output", false)
  .action(async (opts) => {
    try {
      const store = new MemoryStore(path.resolve(String(opts.memory || "./.memory")));
      const snapshot = await store.load();
      if (!snapshot) {
        throw new Error("No exploration memory found. Run explore first.");
      }
      const flows =
        snapshot.flows.length > 0
          ? snapshot.flows
          : extractFlows({
              pages: snapshot.pages,
              elements: snapshot.elements,
              actions: snapshot.actions,
              transitions: snapshot.transitions,
            });
      const context = buildApplicationContext({
        application: snapshot.application,
        pages: snapshot.pages,
        elements: snapshot.elements,
        flows,
        transitions: snapshot.transitions,
        actions: snapshot.actions,
        exploration: {
          ...snapshot.exploration,
          flowsDiscovered: flows.length,
        },
      });
      const files = await generateDocumentation(
        context,
        path.resolve(String(opts.output || "./application-context")),
      );
      if (opts.json) {
        console.log(JSON.stringify({ output: files }, null, 2));
      } else {
        console.log("Report generated:");
        for (const f of files) console.log(`  ${f}`);
      }
    } catch (err) {
      fail(err, Boolean(opts.json));
    }
  });

program
  .command("inspect")
  .description("Inspect discovered application knowledge")
  .option("--memory <dir>", "Memory directory", "./.memory")
  .option("--page <name>", "Filter by page name")
  .option("--json", "Machine-readable output", false)
  .action(async (opts) => {
    try {
      const snapshot = await loadStatus(path.resolve(String(opts.memory || "./.memory")));
      if (!snapshot) {
        throw new Error("No exploration memory found.");
      }
      let pages = snapshot.pages;
      if (opts.page) {
        const q = String(opts.page).toLowerCase();
        pages = pages.filter((p) => p.name.toLowerCase().includes(q));
      }
      const payload = pages.map((p) => ({
        id: p.id,
        name: p.name,
        url: p.url,
        status: p.status,
        elements: snapshot.elements.filter((e) => e.pageId === p.id).map((e) => ({
          name: e.name,
          type: e.type,
          preferred: e.selectors.preferred,
          confidence: e.confidence,
        })),
      }));
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        for (const p of payload) {
          console.log(`\n${p.name} [${p.status}] ${p.url}`);
          for (const e of p.elements) {
            console.log(
              `  - ${e.name} (${e.type}) ${e.preferred.strategy}:${e.preferred.value ?? e.preferred.name} [${e.confidence}]`,
            );
          }
        }
      }
    } catch (err) {
      fail(err, Boolean(opts.json));
    }
  });

program
  .command("ui")
  .description("Open the multi-session Application Explorer web UI")
  .option("--port <n>", "HTTP port", "3847")
  .option("--host <host>", "Bind host", "127.0.0.1")
  .option("--data <dir>", "Session data directory", "./data")
  .action(async (opts) => {
    try {
      const port = Number(opts.port);
      const host = String(opts.host);
      const dataDir = path.resolve(String(opts.data || "./data"));
      const { port: boundPort, host: boundHost } = await startUiServer({
        port,
        host,
        dataDir,
      });
      const url = `http://${boundHost}:${boundPort}`;
      console.log("Application Explorer UI");
      console.log(`  ${url}`);
      console.log(`  Sessions: ${dataDir}`);
      console.log("\nPress Ctrl+C to stop.");
    } catch (err) {
      fail(err, false);
    }
  });

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function fail(err: unknown, json: boolean): never {
  const message = err instanceof Error ? err.message : String(err);
  if (json) {
    console.error(JSON.stringify({ error: message }));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
  throw new Error(message); // unreachable; keeps return type `never` for TS
}

await program.parseAsync(process.argv);
