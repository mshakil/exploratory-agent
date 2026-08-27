import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: Db | null = null;

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required (e.g. postgres://ae:ae@127.0.0.1:5432/agent_explorer)",
    );
  }
  return url;
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: requireDatabaseUrl() });
  }
  return pool;
}

export function getDb(): Db {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

/** Create a dedicated pool/db for tests or short-lived scripts. */
export function createDb(connectionString?: string): { db: Db; pool: pg.Pool; close: () => Promise<void> } {
  const p = new Pool({ connectionString: connectionString ?? requireDatabaseUrl() });
  const d = drizzle(p, { schema });
  return {
    db: d,
    pool: p,
    close: async () => {
      await p.end();
    },
  };
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
