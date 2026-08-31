#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { loadEnvFile } from "../db/load-env.js";
import { ensurePlaywrightBrowsersPath } from "../browser/ensure-browsers-path.js";
import { SessionManager } from "../sessions/manager.js";
import type { ExplorationSession } from "../sessions/types.js";
import {
  DEFAULT_BOUNDARIES,
  type AuthMode,
} from "../models/index.js";
import { startUiServer } from "../server/index.js";
import { AuthService } from "../auth/index.js";
import { closeDb, migrate, requireDatabaseUrl } from "../db/index.js";
import { extractFlows } from "../flows/index.js";
import { generateDocumentation, buildApplicationContext } from "../documentation/index.js";
import { MemoryStore } from "../memory/index.js";

await loadEnvFile();
ensurePlaywrightBrowsersPath();

const program = new Command();

program
  .name("agent-explorer")
  .description(
    "Application Exploration Agent — discover UI structure, workflows, and selectors for SDETs",
  )
  .version("1.0.0");

function dataDirFromOpts(opts: Record<string, unknown>): string {
  return path.resolve(
    String(opts.data || process.env.AE_DATA_DIR || "./data"),
  );
}

async function ensureDb(): Promise<void> {
  requireDatabaseUrl();
  await migrate();
}

async function withCliOwner(): Promise<{
  auth: AuthService;
  ownerUserId: string;
}> {
  const auth = new AuthService();
  await auth.init();
  const owner = await auth.users.ensureCliUser();
  return { auth, ownerUserId: owner.id };
}

function printSessionSummary(session: ExplorationSession, json: boolean): void {
  const payload = {
    sessionId: session.id,
    status: session.status,
    application: session.applicationName,
    url: session.applicationUrl,
    statistics: session.statistics,
    contextPath: session.contextPath,
    memoryPath: session.memoryPath,
    error: session.error,
  };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log("Exploration finished");
    console.log(`  Session:     ${payload.sessionId}`);
    console.log(`  Status:      ${payload.status}`);
    console.log(`  Application: ${payload.application}`);
    console.log(`  Context:     ${payload.contextPath}`);
    if (payload.error) console.log(`  Error:       ${payload.error}`);
  }
}

program
  .command("explore")
  .description("Start an application exploration (requires DATABASE_URL)")
  .requiredOption("--url <url>", "Application base URL")
  .option("--start <path>", "Starting path or URL (appended to base URL when relative)")
  .option("--data <dir>", "Artifact data directory", process.env.AE_DATA_DIR || "./data")
  .option("--storage-state <file>", "Playwright storage state (authenticated session)")
  .option("--username <user>", "Simple credential login username")
  .option("--password <pass>", "Simple credential login password")
  .option("--max-pages <n>", "Maximum pages/states to explore", "50")
  .option("--max-depth <n>", "Maximum exploration depth", "8")
  .option("--max-actions-per-page <n>", "Maximum actions per page", "30")
  .option("--timeout <ms>", "Default interaction timeout", "10000")
  .option("--max-duration <ms>", "Wall-clock exploration budget", "300000")
  .option("--stability <profile>", "Stability profile: fast | balanced | deep", "balanced")
  .option("--explore-shadow", "Traverse open Shadow DOM", false)
  .option("--explore-frames", "Explore same-origin iframes", false)
  .option("--allow-host <host>", "Extra allowed host (repeatable)", collect, [])
  .option("--dismiss-consent", "Dismiss common cookie/consent banners", false)
  .option("--auth-mode <mode>", "none | credentials | storage-state | manual-wait")
  .option("--exclude-url <pattern>", "Excluded URL pattern (repeatable)", collect, [])
  .option("--exclude-action <name>", "Excluded action name substring (repeatable)", collect, [])
  .option("--headed", "Run browser headed (not headless)", false)
  .option("--json", "Emit machine-readable JSON summary", false)
  .option("--verbose", "Verbose operational logs", false)
  .action(async (opts) => {
    try {
      await ensureDb();
      const { ownerUserId } = await withCliOwner();
      const manager = new SessionManager(dataDirFromOpts(opts));
      const baseUrl = String(opts.url);
      const start = opts.start ? String(opts.start) : undefined;
      const applicationUrl =
        start && !/^https?:\/\//i.test(start)
          ? new URL(start, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString()
          : start && /^https?:\/\//i.test(start)
            ? start
            : baseUrl;

      const session = await manager.startExploration(
        {
          applicationUrl,
          ownerUserId,
          username: opts.username ? String(opts.username) : undefined,
          password: opts.password ? String(opts.password) : undefined,
          storageState: opts.storageState ? String(opts.storageState) : undefined,
          headless: opts.headed !== true,
          maxPages: Number(opts.maxPages ?? DEFAULT_BOUNDARIES.maxPages),
          maxDepth: Number(opts.maxDepth ?? DEFAULT_BOUNDARIES.maxDepth),
          maxDurationMs: Number(opts.maxDuration ?? DEFAULT_BOUNDARIES.maxDurationMs),
          stabilityProfile: (opts.stability as "fast" | "balanced" | "deep") || "balanced",
          authMode: (opts.authMode as AuthMode | undefined) || undefined,
          domainAllowlist: opts.allowHost?.length
            ? ([] as string[]).concat(opts.allowHost as string | string[])
            : undefined,
          exploreOpenShadow: opts.exploreShadow ? true : undefined,
          exploreSameOriginFrames: opts.exploreFrames ? true : undefined,
          dismissConsent: opts.dismissConsent ? true : undefined,
        },
        { wait: true },
      );
      printSessionSummary(session, Boolean(opts.json));
      if (session.status === "failed") process.exitCode = 1;
    } catch (err) {
      fail(err, Boolean(opts.json));
    } finally {
      await closeDb().catch(() => undefined);
    }
  });

program
  .command("resume")
  .description("Resume / re-explore an existing session (requires DATABASE_URL)")
  .requiredOption("--session <id>", "Session id to resume")
  .option("--data <dir>", "Artifact data directory", process.env.AE_DATA_DIR || "./data")
  .option("--password <pass>", "Target-app password if needed")
  .option("--headed", "Run browser headed", false)
  .option("--json", "Machine-readable output", false)
  .option("--verbose", "Verbose logs", false)
  .option("--max-pages <n>", "Maximum pages", "50")
  .option("--max-depth <n>", "Maximum depth", "8")
  .option("--max-duration <ms>", "Wall-clock budget", "300000")
  .action(async (opts) => {
    try {
      await ensureDb();
      await withCliOwner();
      const manager = new SessionManager(dataDirFromOpts(opts));
      const session = await manager.resumeExploration(
        String(opts.session),
        {
          password: opts.password ? String(opts.password) : undefined,
          headless: opts.headed !== true,
          maxPages: Number(opts.maxPages),
          maxDepth: Number(opts.maxDepth),
          maxDurationMs: Number(opts.maxDuration),
        },
        { wait: true },
      );
      printSessionSummary(session, Boolean(opts.json));
      if (session.status === "failed") process.exitCode = 1;
    } catch (err) {
      fail(err, Boolean(opts.json));
    } finally {
      await closeDb().catch(() => undefined);
    }
  });

program
  .command("status")
  .description("Show exploration session status from Postgres + memory")
  .option("--session <id>", "Session id")
  .option("--data <dir>", "Artifact data directory", process.env.AE_DATA_DIR || "./data")
  .option("--json", "Machine-readable output", false)
  .action(async (opts) => {
    try {
      await ensureDb();
      const manager = new SessionManager(dataDirFromOpts(opts));
      if (!opts.session) {
        const sessions = await manager.listSessions();
        if (opts.json) {
          console.log(JSON.stringify({ sessions }, null, 2));
        } else if (sessions.length === 0) {
          console.log("No sessions found.");
        } else {
          for (const s of sessions.slice(0, 20)) {
            console.log(
              `${s.id}  ${s.status.padEnd(12)}  ${s.applicationName}  (${s.applicationUrl})`,
            );
          }
        }
        return;
      }
      const session = await manager.getSession(String(opts.session));
      if (!session) throw new Error("Session not found");
      const store = new MemoryStore(session.memoryPath);
      const snapshot = await store.load();
      const payload = {
        sessionId: session.id,
        status: session.status,
        application: session.applicationName,
        url: session.applicationUrl,
        statistics: session.statistics,
        memory: snapshot
          ? {
              pages: snapshot.pages.length,
              elements: snapshot.elements.length,
              flows: snapshot.flows.length,
              actions: snapshot.actions.length,
            }
          : null,
      };
      if (opts.json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.log("Session status");
        console.log(`  Id:          ${payload.sessionId}`);
        console.log(`  Status:      ${payload.status}`);
        console.log(`  Application: ${payload.application}`);
        console.log(`  Pages:       ${payload.statistics.pages}`);
        console.log(`  Elements:    ${payload.statistics.elements}`);
      }
    } catch (err) {
      fail(err, Boolean(opts.json));
    } finally {
      await closeDb().catch(() => undefined);
    }
  });

program
  .command("report")
  .description("Regenerate documentation from session memory")
  .requiredOption("--session <id>", "Session id")
  .option("--data <dir>", "Artifact data directory", process.env.AE_DATA_DIR || "./data")
  .option("--json", "Machine-readable output", false)
  .action(async (opts) => {
    try {
      await ensureDb();
      const manager = new SessionManager(dataDirFromOpts(opts));
      const session = await manager.getSession(String(opts.session));
      if (!session) throw new Error("Session not found");
      const store = new MemoryStore(session.memoryPath);
      const snapshot = await store.load();
      if (!snapshot) {
        throw new Error("No exploration memory found for this session.");
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
      const files = await generateDocumentation(context, session.contextPath, {
        framework: session.framework,
        applicationName: session.applicationName,
        applicationUrl: session.applicationUrl,
        status: session.status,
        statistics: session.statistics,
        runs: await manager.listRuns(session.id),
      });
      if (opts.json) {
        console.log(JSON.stringify({ output: files }, null, 2));
      } else {
        console.log("Report generated:");
        for (const f of files) console.log(`  ${f}`);
      }
    } catch (err) {
      fail(err, Boolean(opts.json));
    } finally {
      await closeDb().catch(() => undefined);
    }
  });

program
  .command("inspect")
  .description("Inspect discovered application knowledge for a session")
  .requiredOption("--session <id>", "Session id")
  .option("--data <dir>", "Artifact data directory", process.env.AE_DATA_DIR || "./data")
  .option("--page <name>", "Filter by page name")
  .option("--json", "Machine-readable output", false)
  .action(async (opts) => {
    try {
      await ensureDb();
      const manager = new SessionManager(dataDirFromOpts(opts));
      const session = await manager.getSession(String(opts.session));
      if (!session) throw new Error("Session not found");
      const store = new MemoryStore(session.memoryPath);
      const snapshot = await store.load();
      if (!snapshot) throw new Error("No exploration memory found.");
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
    } finally {
      await closeDb().catch(() => undefined);
    }
  });

program
  .command("ui")
  .description("Open the multi-session Application Explorer web UI")
  .option("--port <n>", "HTTP port", "3847")
  .option("--host <host>", "Bind host", "127.0.0.1")
  .option("--data <dir>", "Session artifact directory", process.env.AE_DATA_DIR || "./data")
  .action(async (opts) => {
    try {
      const port = Number(opts.port);
      const host = String(opts.host);
      const dataDir = dataDirFromOpts(opts);
      const { port: boundPort, host: boundHost } = await startUiServer({
        port,
        host,
        dataDir,
      });
      const url = `http://${boundHost}:${boundPort}`;
      console.log("Application Explorer UI");
      console.log(`  ${url}`);
      console.log(`  Artifacts: ${dataDir}`);
      console.log(`  Database:  ${process.env.DATABASE_URL ? "connected" : "(set DATABASE_URL)"}`);
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
  throw new Error(message);
}

await program.parseAsync(process.argv);
