import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src", "db", "migrations");
const dest = path.join(root, "dist", "db", "migrations");
mkdirSync(path.dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Copied DB migrations to dist/db/migrations");
