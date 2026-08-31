/**
 * Install Playwright Chromium into a stable user-local browsers directory.
 * Avoids Cursor's ephemeral Temp/cursor-sandbox-cache PLAYWRIGHT_BROWSERS_PATH.
 */
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const EPHEMERAL =
  /cursor-sandbox-cache|[\\/]Temp[\\/][^\\/]*playwright|tmp[\\/].*playwright/i;

function stableDir() {
  if (process.env.AE_PLAYWRIGHT_BROWSERS_PATH?.trim()) {
    return path.resolve(process.env.AE_PLAYWRIGHT_BROWSERS_PATH.trim());
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "ms-playwright",
    );
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  }
  return path.join(os.homedir(), ".cache", "ms-playwright");
}

const current = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
const browsersPath =
  !current || current === "0" || EPHEMERAL.test(current) ? stableDir() : current;

process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
console.log(`Installing Chromium to ${browsersPath}`);

const result = spawnSync(
  process.execPath,
  [path.resolve("node_modules/playwright/cli.js"), "install", "chromium"],
  {
    stdio: "inherit",
    env: process.env,
  },
);

if (result.error || result.status !== 0) {
  const fallback = spawnSync("npx", ["playwright", "install", "chromium"], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  process.exit(fallback.status ?? 1);
}

process.exit(0);
