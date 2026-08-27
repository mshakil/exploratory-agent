import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, requireDatabaseUrl } from "./client.js";
import { loadEnvFile } from "./load-env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function migrationsDir(): string {
  return path.join(__dirname, "migrations");
}

export async function migrate(connectionString?: string): Promise<void> {
  await loadEnvFile();
  if (connectionString) {
    process.env.DATABASE_URL = connectionString;
  }
  requireDatabaseUrl();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const dir = migrationsDir();
    const files = (await readdir(dir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const id = file;
      const existing = await client.query(
        `SELECT 1 FROM schema_migrations WHERE id = $1`,
        [id],
      );
      if (existing.rowCount && existing.rowCount > 0) continue;

      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [id]);
        await client.query("COMMIT");
        console.log(`Applied migration ${id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await migrate();
  const { closeDb } = await import("./client.js");
  await closeDb();
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") || process.argv[1].endsWith("migrate.js"));

if (isDirect) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
