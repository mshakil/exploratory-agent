#!/usr/bin/env node
/**
 * One-shot import of legacy JSON data under AE_DATA_DIR into Postgres.
 *
 * Usage: npm run db:import-json -- --data ./data
 */
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { closeDb, getDb, requireDatabaseUrl } from "./client.js";
import { loadEnvFile } from "./load-env.js";
import { migrate } from "./migrate.js";
import { users, explorationSessions, explorationRuns, explorationEvents } from "./schema.js";

interface LegacyUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  role: string;
  email?: string;
  azureOid?: string;
}

interface LegacySession {
  id: string;
  applicationName: string;
  applicationUrl: string;
  username?: string;
  framework?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  currentExplorationId?: string;
  statistics?: {
    pages?: number;
    elements?: number;
    actions?: number;
    flows?: number;
    skipped?: number;
  };
  ownerUserId?: string;
  latestChanges?: Record<string, number>;
  stabilityProfile?: string;
  authMode?: string;
  domainAllowlist?: string[];
  exploreOpenShadow?: boolean;
  exploreSameOriginFrames?: boolean;
  dismissConsent?: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): { data: string } {
  let data = process.env.AE_DATA_DIR || "./data";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--data" && argv[i + 1]) {
      data = argv[++i]!;
    }
  }
  return { data: path.resolve(data) };
}

async function main(): Promise<void> {
  await loadEnvFile();
  const { data } = parseArgs(process.argv.slice(2));
  requireDatabaseUrl();
  await migrate();
  const db = getDb();

  let adminId: string | null = null;

  const usersFile = path.join(data, "users", "users.json");
  if (await exists(usersFile)) {
    const parsed = JSON.parse(await readFile(usersFile, "utf8")) as { users?: LegacyUser[] };
    const list = parsed.users ?? [];
    for (const u of list) {
      await db
        .insert(users)
        .values({
          id: u.id,
          username: u.username,
          usernameLower: u.username.toLowerCase(),
          passwordHash: u.passwordHash,
          salt: u.salt,
          role: u.role,
          email: u.email ?? null,
          azureOid: u.azureOid ?? null,
          createdAt: u.createdAt,
        })
        .onConflictDoNothing();
      if (u.role === "admin" && !adminId) adminId = u.id;
      console.log(`  user ${u.username}`);
    }
  }

  if (!adminId) {
    const rows = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
    adminId = rows[0]?.id ?? null;
  }

  const sessionsRoot = path.join(data, "sessions");
  if (!(await exists(sessionsRoot))) {
    console.log("No sessions directory; done.");
    await closeDb();
    return;
  }

  const entries = await readdir(sessionsRoot);
  for (const entry of entries) {
    const sessionFile = path.join(sessionsRoot, entry, "session.json");
    if (!(await exists(sessionFile))) continue;

    const raw = JSON.parse(await readFile(sessionFile, "utf8")) as LegacySession;
    const ownerUserId = raw.ownerUserId || adminId;
    if (!ownerUserId) {
      console.warn(`  skip ${entry}: no owner and no admin user`);
      continue;
    }

    const stats = raw.statistics ?? {};
    await db
      .insert(explorationSessions)
      .values({
        id: raw.id,
        ownerUserId,
        applicationName: raw.applicationName,
        applicationUrl: raw.applicationUrl,
        targetUsername: raw.username ?? null,
        framework: raw.framework ?? "independent",
        status: raw.status,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt ?? raw.completedAt ?? raw.createdAt,
        startedAt: raw.startedAt ?? null,
        completedAt: raw.completedAt ?? null,
        error: raw.error ?? null,
        currentExplorationId: raw.currentExplorationId ?? null,
        statsPages: stats.pages ?? 0,
        statsElements: stats.elements ?? 0,
        statsActions: stats.actions ?? 0,
        statsFlows: stats.flows ?? 0,
        statsSkipped: stats.skipped ?? 0,
        contextRelpath: path.posix.join("sessions", raw.id, "application-context"),
        memoryRelpath: path.posix.join("sessions", raw.id, "memory"),
        stabilityProfile: raw.stabilityProfile ?? null,
        authMode: raw.authMode ?? null,
        domainAllowlist: raw.domainAllowlist ?? [],
        exploreOpenShadow: raw.exploreOpenShadow ?? null,
        exploreSameOriginFrames: raw.exploreSameOriginFrames ?? null,
        dismissConsent: raw.dismissConsent ?? null,
        latestChanges: raw.latestChanges ?? null,
      })
      .onConflictDoNothing();

    const runsDir = path.join(sessionsRoot, entry, "exploration-runs");
    if (await exists(runsDir)) {
      for (const runFile of await readdir(runsDir)) {
        if (!runFile.endsWith(".json")) continue;
        const run = JSON.parse(
          await readFile(path.join(runsDir, runFile), "utf8"),
        ) as {
          id: string;
          sessionId: string;
          type: string;
          startedAt: string;
          completedAt?: string;
          status: string;
          statistics?: Record<string, number>;
          changeReportPath?: string;
        };
        await db
          .insert(explorationRuns)
          .values({
            id: run.id,
            sessionId: raw.id,
            type: run.type,
            startedAt: run.startedAt,
            completedAt: run.completedAt ?? null,
            status: run.status,
            statistics: run.statistics ?? {},
            changeReportRelpath: run.changeReportPath ?? null,
          })
          .onConflictDoNothing();
      }
    }

    const eventsFile = path.join(sessionsRoot, entry, "events.json");
    if (await exists(eventsFile)) {
      const events = JSON.parse(await readFile(eventsFile, "utf8")) as Array<{
        id: string;
        sessionId: string;
        timestamp: string;
        type: string;
        title: string;
        description?: string;
        metadata?: Record<string, unknown>;
        status: string;
      }>;
      for (const ev of events) {
        await db
          .insert(explorationEvents)
          .values({
            id: ev.id,
            sessionId: raw.id,
            ts: ev.timestamp,
            type: ev.type,
            title: ev.title,
            description: ev.description ?? null,
            metadata: ev.metadata ?? null,
            status: ev.status,
          })
          .onConflictDoNothing();
      }
    }

    console.log(`  session ${raw.id}`);
  }

  console.log("Import complete. JSON files left on disk as backup.");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
