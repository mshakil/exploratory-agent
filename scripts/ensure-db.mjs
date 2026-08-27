/**
 * Ensure the database named in DATABASE_URL exists (creates it via /postgres).
 * Does not print credentials.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

async function loadEnv(filePath = path.resolve(".env")) {
  try {
    const text = await readFile(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
  return `"${name}"`;
}

async function main() {
  await loadEnv();
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");

  const parsed = new URL(url);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "") || "agent_explorer");
  parsed.pathname = "/postgres";

  const admin = new pg.Client({ connectionString: parsed.toString() });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if ((exists.rowCount ?? 0) === 0) {
      await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
      console.log(`Created database ${dbName}`);
    } else {
      console.log(`Database ${dbName} already exists`);
    }
  } finally {
    await admin.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
