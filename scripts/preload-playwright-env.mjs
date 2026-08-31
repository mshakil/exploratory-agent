/**
 * Pin PLAYWRIGHT_BROWSERS_PATH before any app code (or Playwright) loads.
 * Usage: node --import ./scripts/preload-playwright-env.mjs …
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
if (!current || current === "0" || EPHEMERAL.test(current)) {
  const next = stableDir();
  if (current && EPHEMERAL.test(current)) {
    console.warn(
      `[playwright] Preload: ignoring ephemeral PLAYWRIGHT_BROWSERS_PATH; using ${next}`,
    );
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = next;
}
