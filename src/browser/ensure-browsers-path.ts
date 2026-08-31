import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** Cursor / temp sandbox caches that get wiped between runs. */
const EPHEMERAL_BROWSERS_PATH =
  /cursor-sandbox-cache|[\\/]Temp[\\/][^\\/]*playwright|tmp[\\/].*playwright/i;

function defaultStableBrowsersDir(): string {
  const fromEnv = process.env.AE_PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);

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

function isEphemeralBrowsersPath(value: string | undefined): boolean {
  if (!value || value === "0") return true;
  return EPHEMERAL_BROWSERS_PATH.test(value);
}

/**
 * Force Playwright browsers into a stable user-local directory.
 * Cursor Agent often injects PLAYWRIGHT_BROWSERS_PATH under Temp/cursor-sandbox-cache,
 * which is wiped — and playwright-core freezes that path at import time.
 */
export function ensurePlaywrightBrowsersPath(): string {
  const current = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (current && !isEphemeralBrowsersPath(current)) {
    return current;
  }

  const stable = defaultStableBrowsersDir();
  if (current && isEphemeralBrowsersPath(current) && current !== stable) {
    console.warn(
      `[playwright] Ignoring ephemeral PLAYWRIGHT_BROWSERS_PATH (${current}); using ${stable}`,
    );
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = stable;
  return stable;
}

async function readChromiumRevision(kind: "chromium" | "chromium-headless-shell"): Promise<string> {
  const pkgJson = require.resolve("playwright-core/package.json");
  const browsersJson = path.join(path.dirname(pkgJson), "browsers.json");
  const data = JSON.parse(await readFile(browsersJson, "utf8")) as {
    browsers: Array<{ name: string; revision: string }>;
  };
  const entry = data.browsers.find((b) => b.name === kind);
  if (!entry?.revision) {
    throw new Error(`Could not resolve Playwright ${kind} revision from browsers.json`);
  }
  return entry.revision;
}

function candidateExecutables(browsersPath: string, revision: string, headless: boolean): string[] {
  if (headless) {
    const dir = path.join(browsersPath, `chromium_headless_shell-${revision}`);
    return [
      path.join(dir, "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
      path.join(dir, "chrome-headless-shell-linux64", "chrome-headless-shell"),
      path.join(dir, "chrome-headless-shell-mac-x64", "chrome-headless-shell"),
      path.join(dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"),
    ];
  }
  const dir = path.join(browsersPath, `chromium-${revision}`);
  return [
    path.join(dir, "chrome-win64", "chrome.exe"),
    path.join(dir, "chrome-linux", "chrome"),
    path.join(dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
    path.join(dir, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
  ];
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await access(p);
      return p;
    } catch {
      // try next
    }
  }
  return null;
}

async function installChromium(browsersPath: string): Promise<void> {
  console.warn(
    `[playwright] Chromium not found in ${browsersPath}; installing (one-time)…`,
  );
  const playwrightCli = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../node_modules/playwright/cli.js",
  );
  try {
    await access(playwrightCli);
    await execFileAsync(process.execPath, [playwrightCli, "install", "chromium"], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
      windowsHide: true,
    });
  } catch {
    await execFileAsync("npx", ["playwright", "install", "chromium"], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
      windowsHide: true,
      shell: true,
    });
  }
}

/**
 * Ensure Chromium exists under the stable browsers path; install once if missing.
 */
export async function ensurePlaywrightChromiumInstalled(): Promise<string> {
  const browsersPath = ensurePlaywrightBrowsersPath();
  const revision = await readChromiumRevision("chromium-headless-shell").catch(() =>
    readChromiumRevision("chromium"),
  );
  const existing = await firstExisting(candidateExecutables(browsersPath, revision, true));
  if (existing) return browsersPath;
  await installChromium(browsersPath);
  return browsersPath;
}

/**
 * Resolve an absolute Chromium executable under the stable cache.
 * Passing this to chromium.launch({ executablePath }) bypasses Playwright's
 * frozen registryDirectory (which may still point at Cursor's temp sandbox).
 */
export async function resolveChromiumExecutable(headless = true): Promise<string> {
  const browsersPath = await ensurePlaywrightChromiumInstalled();
  const kind = headless ? "chromium-headless-shell" : "chromium";
  let revision: string;
  try {
    revision = await readChromiumRevision(kind);
  } catch {
    revision = await readChromiumRevision("chromium");
  }

  let exe = await firstExisting(candidateExecutables(browsersPath, revision, headless));
  if (!exe && headless) {
    // Fall back to full chromium if headless-shell missing.
    const fullRev = await readChromiumRevision("chromium");
    exe = await firstExisting(candidateExecutables(browsersPath, fullRev, false));
  }
  if (!exe) {
    await installChromium(browsersPath);
    exe = await firstExisting(candidateExecutables(browsersPath, revision, headless));
  }
  if (!exe) {
    throw new Error(
      `Playwright Chromium executable not found under ${browsersPath}. Run: npm run prepare:browsers`,
    );
  }
  return exe;
}
