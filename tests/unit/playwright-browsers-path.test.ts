import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ensurePlaywrightBrowsersPath } from "../../src/browser/ensure-browsers-path.js";

describe("ensurePlaywrightBrowsersPath", () => {
  const original = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const originalAe = process.env.AE_PLAYWRIGHT_BROWSERS_PATH;

  afterEach(() => {
    if (original === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = original;
    if (originalAe === undefined) delete process.env.AE_PLAYWRIGHT_BROWSERS_PATH;
    else process.env.AE_PLAYWRIGHT_BROWSERS_PATH = originalAe;
  });

  it("replaces Cursor sandbox temp paths with a stable directory", () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH =
      "C:\\Users\\x\\AppData\\Local\\Temp\\cursor-sandbox-cache\\abc\\playwright";
    delete process.env.AE_PLAYWRIGHT_BROWSERS_PATH;
    const next = ensurePlaywrightBrowsersPath();
    expect(next).not.toMatch(/cursor-sandbox-cache/i);
    expect(next).toMatch(/ms-playwright/i);
    expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe(next);
  });

  it("resolves a real chromium executable under the stable cache", async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH =
      "C:\\Users\\x\\AppData\\Local\\Temp\\cursor-sandbox-cache\\abc\\playwright";
    delete process.env.AE_PLAYWRIGHT_BROWSERS_PATH;
    const { resolveChromiumExecutable } = await import(
      "../../src/browser/ensure-browsers-path.js"
    );
    const exe = await resolveChromiumExecutable(true);
    expect(exe).toMatch(/chrome-headless-shell|chrome\.exe|chrome$/i);
    expect(exe).not.toMatch(/cursor-sandbox-cache/i);
  });
});
