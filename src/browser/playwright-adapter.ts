import type { Browser, BrowserContext, Page, Locator } from "playwright";
import {
  ensurePlaywrightBrowsersPath,
  ensurePlaywrightChromiumInstalled,
  resolveChromiumExecutable,
} from "./ensure-browsers-path.js";
import type {
  ActionResult,
  BrowserAdapter,
  ElementReference,
  ElementSnapshot,
  PageState,
} from "./types.js";
import {
  type StabilityProfile,
  stabilityTimingFor,
} from "../models/index.js";

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "textarea",
  "select",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='option']",
  "[role='combobox']",
  "[role='switch']",
  "summary",
].join(", ");

function isNavigationRaceError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /Execution context was destroyed/i.test(message) ||
    /Cannot find context with specified id/i.test(message) ||
    /Target closed/i.test(message) ||
    /frame was detached/i.test(message) ||
    /most likely because of a navigation/i.test(message)
  );
}

/**
 * Import playwright only after PLAYWRIGHT_BROWSERS_PATH is pinned.
 * A static `import "playwright"` freezes Cursor's ephemeral sandbox path into
 * playwright-core's module-level registryDirectory — so we also pass an explicit
 * executablePath from the stable cache.
 */
async function loadChromium() {
  ensurePlaywrightBrowsersPath();
  await ensurePlaywrightChromiumInstalled();
  const pw = await import("playwright");
  return pw.chromium;
}

export class PlaywrightAdapter implements BrowserAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private handleMap = new Map<string, Locator>();
  private handleCounter = 0;
  private actionTimeoutMs = 10_000;
  private navigationTimeoutMs = 60_000;

  async launch(options?: {
    headless?: boolean;
    storageState?: string;
    timeoutMs?: number;
    navigationTimeoutMs?: number;
  }): Promise<void> {
    this.actionTimeoutMs = options?.timeoutMs ?? 10_000;
    this.navigationTimeoutMs =
      options?.navigationTimeoutMs ?? Math.max(this.actionTimeoutMs, 60_000);

    const headless = options?.headless ?? true;
    const chromium = await loadChromium();
    const executablePath = await resolveChromiumExecutable(headless);

    this.browser = await chromium.launch({
      headless,
      executablePath,
    });
    this.context = await this.browser.newContext({
      storageState: options?.storageState,
      viewport: { width: 1280, height: 800 },
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.actionTimeoutMs);
    this.page.setDefaultNavigationTimeout(this.navigationTimeoutMs);
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
    this.handleMap.clear();
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    return this.page;
  }

  /**
   * Wait until the document is usable after clicks/navigations.
   * Avoids evaluate races when Playwright destroys the old execution context.
   * Profile controls settle depth (Fast / Balanced / Deep).
   */
  private async waitForSettled(
    timeoutMs = 5_000,
    profile: StabilityProfile = "balanced",
  ): Promise<void> {
    const page = this.requirePage();
    const timing = stabilityTimingFor(profile);
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
    } catch {
      // page may already be loaded or navigations may be hash-only
    }
    try {
      await page.waitForLoadState("load", { timeout: Math.min(timeoutMs, 2_000) });
    } catch {
      // best-effort
    }

    if (timing.networkIdle) {
      try {
        await page.waitForLoadState("networkidle", {
          timeout: Math.min(timeoutMs, timing.networkIdleCapMs || 3_000),
        });
      } catch {
        // capped; SPA may keep connections open
      }
    }

    if (timing.mutationQuietMs > 0) {
      await this.waitForMutationQuiet(page, timing.mutationQuietMs, timeoutMs);
    }

    await page.waitForTimeout(Math.max(timing.settleMs, 50));
  }

  private async waitForMutationQuiet(
    page: Page,
    quietMs: number,
    overallTimeoutMs: number,
  ): Promise<void> {
    try {
      await page.evaluate(
        async ({ quiet, overall }) => {
          await new Promise<void>((resolve) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const done = () => {
              observer.disconnect();
              if (timer) clearTimeout(timer);
              resolve();
            };
            const bump = () => {
              if (timer) clearTimeout(timer);
              timer = setTimeout(done, quiet);
            };
            const observer = new MutationObserver(bump);
            observer.observe(document.documentElement, {
              childList: true,
              subtree: true,
              attributes: true,
              characterData: true,
            });
            bump();
            setTimeout(done, overall);
          });
        },
        { quiet: quietMs, overall: Math.min(overallTimeoutMs, 5_000) },
      );
    } catch {
      // best-effort — frame may have navigated
    }
  }

  private async evaluateWithRetry<T>(
    fn: (arg: string) => T | Promise<T>,
    arg: string,
    attempts = 3,
  ): Promise<T> {
    const page = this.requirePage();
    let lastError: unknown;

    for (let i = 0; i < attempts; i++) {
      try {
        await this.waitForSettled(3_000);
        return await page.evaluate(fn, arg);
      } catch (err) {
        lastError = err;
        if (!isNavigationRaceError(err) || i === attempts - 1) {
          throw err;
        }
        // Navigation tore down the context — wait for the new document and retry
        await this.waitForSettled(5_000);
        await page.waitForTimeout(150 * (i + 1));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async navigate(url: string): Promise<void> {
    const page = this.requirePage();
    const current = page.url();
    try {
      const next = new URL(url, current);
      const cur = new URL(current);
      const sameDocument =
        next.origin === cur.origin &&
        next.pathname === cur.pathname &&
        next.search === cur.search &&
        next.hash !== cur.hash;

      if (sameDocument) {
        try {
          await this.evaluateWithRetry((hash) => {
            if (location.hash !== hash) {
              location.hash = hash;
            }
          }, next.hash);
        } catch {
          // Fall back to full navigation if hash update races with a reload
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: this.navigationTimeoutMs,
          });
        }
        await this.waitForSettled();
        return;
      }
    } catch {
      // URL parse / unexpected — fall through to goto
    }

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: this.navigationTimeoutMs,
    });
    await this.waitForSettled();
  }

  async getCurrentUrl(): Promise<string> {
    return this.requirePage().url();
  }

  async getPageTitle(): Promise<string> {
    const page = this.requirePage();
    try {
      await this.waitForSettled(2_000);
      return await page.title();
    } catch (err) {
      if (isNavigationRaceError(err)) {
        await this.waitForSettled(5_000);
        return page.title();
      }
      throw err;
    }
  }

  async waitForStability(
    timeoutMs = 100,
    profile: StabilityProfile = "balanced",
  ): Promise<void> {
    await this.waitForSettled(Math.max(timeoutMs, 1_000), profile);
  }

  async goBack(): Promise<void> {
    const page = this.requirePage();
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await this.waitForSettled();
  }

  async getInteractiveElements(): Promise<ElementSnapshot[]> {
    this.handleMap.clear();
    this.handleCounter = 0;

    const raw = await this.evaluateWithRetry((selector) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      return nodes
        .map((el, index) => {
          const html = el as HTMLElement;
          const style = window.getComputedStyle(html);
          const isVisible =
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            html.getClientRects().length > 0;
          if (!isVisible) return null;

          const attrs: Record<string, string> = {};
          for (const attr of Array.from(el.attributes)) {
            if (
              attr.name.toLowerCase() === "value" &&
              (el as HTMLInputElement).type === "password"
            ) {
              attrs[attr.name] = "***";
            } else {
              attrs[attr.name] = attr.value;
            }
          }

          const tag = el.tagName.toLowerCase();
          const text = (html.innerText || "").trim().slice(0, 200);
          const accessibleName =
            attrs["aria-label"] ||
            attrs["title"] ||
            attrs["placeholder"] ||
            attrs["name"] ||
            attrs["alt"] ||
            text ||
            attrs["id"] ||
            attrs["data-testid"] ||
            attrs["data-test"] ||
            tag;

          const role =
            attrs["role"] ||
            (tag === "a"
              ? "link"
              : tag === "button"
                ? "button"
                : tag === "select"
                  ? "combobox"
                  : tag === "input"
                    ? attrs["type"] === "checkbox"
                      ? "checkbox"
                      : attrs["type"] === "radio"
                        ? "radio"
                        : attrs["type"] === "password"
                          ? undefined // password has no ARIA textbox role in Playwright
                          : "textbox"
                    : tag === "textarea"
                      ? "textbox"
                      : undefined);

          let options: string[] | undefined;
          if (tag === "select") {
            options = Array.from((el as HTMLSelectElement).options).map(
              (o) => o.text.trim() || o.value,
            );
          }

          let checked: boolean | undefined;
          if (
            attrs["type"] === "checkbox" ||
            attrs["type"] === "radio" ||
            role === "checkbox" ||
            role === "radio"
          ) {
            checked = (el as HTMLInputElement).checked;
          }

          const parts: string[] = [];
          let current: Element | null = el;
          while (current && current.nodeType === 1 && parts.length < 5) {
            let part = current.tagName.toLowerCase();
            if ((current as HTMLElement).id) {
              part += `#${(current as HTMLElement).id.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1")}`;
              parts.unshift(part);
              break;
            }
            const parentNode = current.parentElement as Element | null;
            if (parentNode) {
              const siblings = Array.from(parentNode.children).filter(
                (child) => (child as Element).tagName === (current as Element).tagName,
              );
              if (siblings.length > 1) {
                part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
              }
            }
            parts.unshift(part);
            current = parentNode;
          }

          return {
            index,
            tag,
            type: attrs["type"],
            role,
            text,
            accessibleName: accessibleName.trim() || tag,
            attributes: attrs,
            isVisible,
            isEnabled: !(el as HTMLButtonElement).disabled,
            options,
            checked,
            inputType: attrs["type"],
            placeholder: attrs["placeholder"],
            href: attrs["href"],
            cssPath: parts.join(" > "),
          };
        })
        .filter(Boolean);
    }, INTERACTIVE_SELECTOR);

    const snapshots: ElementSnapshot[] = [];
    for (const item of raw as Array<Record<string, unknown>>) {
      const handleId = `el-${++this.handleCounter}`;
      snapshots.push({
        tag: String(item.tag),
        type: item.type as string | undefined,
        role: item.role as string | undefined,
        text: String(item.text || ""),
        accessibleName: String(item.accessibleName || ""),
        attributes: (item.attributes as Record<string, string>) || {},
        isVisible: Boolean(item.isVisible),
        isEnabled: Boolean(item.isEnabled),
        options: item.options as string[] | undefined,
        checked: item.checked as boolean | undefined,
        inputType: item.inputType as string | undefined,
        placeholder: item.placeholder as string | undefined,
        href: item.href as string | undefined,
        handleId,
        cssPath: item.cssPath as string | undefined,
      });
    }

    return snapshots;
  }

  private resolveLocator(element: ElementReference): Locator {
    const page = this.requirePage();

    if (element.strategy === "testId" && element.value) {
      // Playwright getByTestId defaults to data-testid only; many apps use data-test / data-cy / data-qa.
      const v = JSON.stringify(element.value);
      return page.locator(
        `[data-testid=${v}], [data-test=${v}], [data-cy=${v}], [data-qa=${v}]`,
      );
    }
    if (element.strategy === "role" && element.role) {
      return page.getByRole(element.role as Parameters<Page["getByRole"]>[0], {
        name: element.name,
        exact: false,
      });
    }
    if (element.strategy === "label" && element.value) {
      return page.getByLabel(element.value, { exact: false });
    }
    if (element.strategy === "ariaLabel" && element.value) {
      return page.locator(`[aria-label=${JSON.stringify(element.value)}]`);
    }
    if (element.strategy === "name" && element.value) {
      return page.locator(`[name=${JSON.stringify(element.value)}]`);
    }
    if (element.strategy === "placeholder" && element.value) {
      return page.getByPlaceholder(element.value, { exact: false });
    }
    if (element.strategy === "text" && element.value) {
      return page.getByText(element.value, { exact: false });
    }
    if (element.strategy === "css" && element.value) {
      return page.locator(element.value);
    }
    if (element.css) {
      return page.locator(element.css);
    }
    if (element.value) {
      return page.locator(element.value);
    }
    throw new Error("Unable to resolve element reference");
  }

  private async withAction(fn: () => Promise<void>): Promise<ActionResult> {
    try {
      await fn();
      await this.waitForSettled();
      return { success: true };
    } catch (err) {
      // Clicks often trigger navigation; treat context-destroyed as success if page settled
      if (isNavigationRaceError(err)) {
        await this.waitForSettled().catch(() => undefined);
        return { success: true };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
        timedOut: /timeout/i.test(message),
      };
    }
  }

  async click(element: ElementReference): Promise<ActionResult> {
    return this.withAction(async () => {
      const loc = this.resolveLocator(element);
      const target = element.index != null ? loc.nth(element.index) : loc.first();
      // Don't fail the whole action if navigation interrupts the click acknowledgment
      try {
        await target.click({ timeout: 5_000, force: true, noWaitAfter: true });
      } catch (err) {
        if (!isNavigationRaceError(err)) throw err;
      }
    });
  }

  async type(element: ElementReference, value: string): Promise<ActionResult> {
    return this.withAction(async () => {
      const loc = this.resolveLocator(element);
      const target = element.index != null ? loc.nth(element.index) : loc.first();
      await target.fill(value, { timeout: 2_000 });
    });
  }

  async select(element: ElementReference, value: string): Promise<ActionResult> {
    return this.withAction(async () => {
      const loc = this.resolveLocator(element);
      const target = element.index != null ? loc.nth(element.index) : loc.first();
      try {
        await target.selectOption({ label: value }, { timeout: 2_000 });
      } catch {
        await target.selectOption({ value }, { timeout: 2_000 });
      }
    });
  }

  async check(element: ElementReference, checked = true): Promise<ActionResult> {
    return this.withAction(async () => {
      const loc = this.resolveLocator(element);
      const target = element.index != null ? loc.nth(element.index) : loc.first();
      if (checked) {
        await target.check({ timeout: 2_000, force: true });
      } else {
        await target.uncheck({ timeout: 2_000, force: true });
      }
    });
  }

  async getState(): Promise<PageState> {
    const page = this.requirePage();
    await this.waitForSettled();

    let interactiveElements: ElementSnapshot[] = [];
    try {
      interactiveElements = await this.getInteractiveElements();
    } catch (err) {
      if (!isNavigationRaceError(err)) throw err;
      await this.waitForSettled(5_000);
      interactiveElements = await this.getInteractiveElements();
    }

    const modalOpen = await page
      .locator('[role="dialog"], dialog, .modal:visible, [aria-modal="true"]')
      .first()
      .isVisible()
      .catch(() => false);

    const activeTab = await page
      .locator('[role="tab"][aria-selected="true"]')
      .first()
      .innerText()
      .catch(() => undefined);

    const pageMarker = await page
      .locator("[data-page]")
      .first()
      .getAttribute("data-page")
      .catch(() => null);

    const visibleTextSample =
      pageMarker ||
      (await page
        .locator("h1, h2, main")
        .first()
        .innerText()
        .catch(() => ""));

    let title = "";
    try {
      title = await page.title();
    } catch {
      await this.waitForSettled(3_000);
      title = await page.title().catch(() => "");
    }

    return {
      url: page.url(),
      title,
      interactiveElements,
      modalOpen,
      activeTab: activeTab?.trim(),
      visibleTextSample: String(visibleTextSample || "")
        .trim()
        .slice(0, 300),
    };
  }

  async saveStorageState(path: string): Promise<void> {
    if (!this.context) throw new Error("No browser context");
    await this.context.storageState({ path });
  }
}
