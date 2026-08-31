/**
 * Pin PLAYWRIGHT_BROWSERS_PATH to a stable user-local directory before install.
 * Usage: node scripts/ensure-playwright-path.mjs
 */
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
const next = !current || current === "0" || EPHEMERAL.test(current) ? stableDir() : current;
process.env.PLAYWRIGHT_BROWSERS_PATH = next;
// Expose for shell wrappers: node scripts/ensure-playwright-path.mjs && echo %PLAYWRIGHT...
console.log(next);
