import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe } from "vitest";
import { sql } from "drizzle-orm";
import pg from "pg";
import { closeDb, createDb, migrate, loadEnvFile, type Db } from "../../src/db/index.js";

await loadEnvFile();

const url = process.env.DATABASE_URL?.trim();

let probed = false;
let dbReady = false;

export async function isDbReady(): Promise<boolean> {
  if (probed) return dbReady;
  probed = true;
  if (!url) {
    dbReady = false;
    return false;
  }
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    await client.end();
    dbReady = true;
  } catch (err) {
    dbReady = false;
    await client.end().catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tests] Skipping Postgres suites: ${msg}`);
  }
  return dbReady;
}

/** Suite helper: skips every test when DATABASE_URL is missing or unreachable. */
export function describeDb(name: string, fn: () => void): void {
  describe(name, () => {
    beforeAll(async () => {
      await isDbReady();
    });
    beforeEach(async (ctx) => {
      if (!(await isDbReady())) ctx.skip();
    });
    fn();
  });
}

let shared: { db: Db; close: () => Promise<void> } | null = null;

export async function setupTestDb(): Promise<{
  db: Db;
  dataRoot: string;
  cleanup: () => Promise<void>;
}> {
  if (!(await isDbReady()) || !url) {
    throw new Error("DATABASE_URL required and reachable");
  }
  process.env.AE_SESSION_SECRET =
    process.env.AE_SESSION_SECRET || "test-secret-at-least-16-chars";

  if (!shared) {
    await migrate(url);
    shared = createDb(url);
  }

  await shared.db.execute(sql`
    TRUNCATE exploration_events, exploration_runs, exploration_sessions, users
    RESTART IDENTITY CASCADE
  `);

  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ae-data-"));
  return {
    db: shared.db,
    dataRoot,
    cleanup: async () => {
      await rm(dataRoot, { recursive: true, force: true });
    },
  };
}

afterAll(async () => {
  if (shared) {
    await shared.close();
    shared = null;
  }
  await closeDb().catch(() => undefined);
});
