import path from "node:path";
import type { BrowserAdapter } from "../browser/types.js";
import { PlaywrightAdapter } from "../browser/playwright-adapter.js";
import { classifyAction } from "../discovery/action-classifier.js";
import { createPageRecord, discoverElements, slugify } from "../discovery/index.js";
import {
  isLoginSubmit,
  isPasswordField,
  isUsernameField,
  resolveAuthTypedValue,
} from "../discovery/login-fields.js";
import { extractFlows } from "../flows/index.js";
import { ApplicationGraph } from "../graph/index.js";
import { MemoryStore } from "../memory/index.js";
import { buildApplicationContext, generateDocumentation } from "../documentation/index.js";
import { detectChanges, type ChangeReport } from "../changes/index.js";
import { toElementReference } from "../selectors/index.js";
import { fingerprintState } from "../state/index.js";
import type {
  Action,
  ApplicationContext,
  Element,
  ExploreOptions,
  ExplorationMeta,
  Page,
} from "../models/index.js";
import { DEFAULT_TEST_DATA, ApplicationContextSchema } from "../models/index.js";
import type { ExplorationEventPayload, RunStatistics } from "../sessions/types.js";
import { readFile } from "node:fs/promises";

export interface ExploreResult {
  outputFiles: string[];
  exploration: ExplorationMeta;
  contextPath: string;
  changeReport?: ChangeReport;
  runStatistics?: RunStatistics;
}

export type ExplorationEventHandler = (event: ExplorationEventPayload) => void;

export class Explorer {
  private graph = new ApplicationGraph();
  private elements = new Map<string, Element>();
  private actions: Action[] = [];
  private visited = new Set<string>();
  private exploring = new Set<string>();
  private memory: MemoryStore;
  private logger: Logger;
  private depthByPage = new Map<string, number>();
  private totalActions = 0;
  private readonly maxTotalActions: number;
  private readonly onEvent?: ExplorationEventHandler;

  constructor(
    private readonly options: ExploreOptions,
    private readonly browser: BrowserAdapter = new PlaywrightAdapter(),
    onEvent?: ExplorationEventHandler,
  ) {
    this.memory = new MemoryStore(options.memoryDir);
    this.logger = new Logger(options.verbose, options.json);
    this.onEvent = onEvent;
    // Safety cap — real apps can raise via higher maxPages / maxActionsPerPage
    this.maxTotalActions = Math.min(
      200,
      Math.max(
        20,
        options.boundaries.maxPages * Math.min(options.boundaries.maxActionsPerPage, 10),
      ),
    );
  }

  private emit(event: ExplorationEventPayload): void {
    if (!this.onEvent) return;
    try {
      this.onEvent({
        ...event,
        statistics: event.statistics ?? this.liveStatistics(),
      });
    } catch {
      // UI listeners must not break exploration
    }
  }

  private liveStatistics(): ExplorationEventPayload["statistics"] {
    return {
      pages: this.graph.listPages().length,
      elements: this.elements.size,
      actions: this.actions.filter((a) => a.status === "EXECUTED").length,
      flows: 0,
    };
  }

  private emitChangeEvents(report: ChangeReport): void {
    for (const p of report.newPages) {
      this.emit({
        type: "change_detected",
        title: "New page discovered",
        description: `+ ${p.url}`,
        status: "new",
        metadata: { kind: "page", change: "added", ...p },
      });
    }
    for (const p of report.removedPages) {
      this.emit({
        type: "change_detected",
        title: "Removed page detected",
        description: `- ${p.url}`,
        status: "removed",
        metadata: { kind: "page", change: "removed", ...p },
      });
    }
    for (const e of report.newElements.slice(0, 30)) {
      this.emit({
        type: "change_detected",
        title: "New element discovered",
        description: `+ "${e.name}"`,
        status: "new",
        metadata: { kind: "element", change: "added", ...e },
      });
    }
    for (const e of report.removedElements.slice(0, 30)) {
      this.emit({
        type: "change_detected",
        title: "Removed element detected",
        description: `- "${e.name}"`,
        status: "removed",
        metadata: { kind: "element", change: "removed", ...e },
      });
    }
    for (const c of report.changedSelectors) {
      this.emit({
        type: "change_detected",
        title: "Selector changed",
        description: `~ "${c.name}"`,
        status: "changed",
        metadata: { kind: "selector", change: "changed", ...c },
      });
    }
    for (const f of report.newFlows) {
      this.emit({
        type: "change_detected",
        title: "New flow discovered",
        description: `+ "${f.name}"`,
        status: "new",
        metadata: { kind: "flow", change: "added", ...f },
      });
    }
    for (const f of report.changedFlows) {
      this.emit({
        type: "change_detected",
        title: "Flow changed",
        description: `~ "${f.name}"`,
        status: "changed",
        metadata: { kind: "flow", change: "changed", ...f },
      });
    }
    for (const u of report.unresolved) {
      this.emit({
        type: "change_detected",
        title: "Unresolved Change",
        description: u.detail,
        status: "skipped",
        metadata: { changeKind: u.kind, detail: u.detail },
      });
    }
  }

  async run(resume = false): Promise<ExploreResult> {
    const startedAt = new Date().toISOString();
    const wallClockDeadline = Date.now() + this.options.boundaries.maxDurationMs;
    let meta: ExplorationMeta = {
      startedAt,
      status: "running",
      pagesDiscovered: 0,
      elementsDiscovered: 0,
      flowsDiscovered: 0,
      selectorsCaptured: 0,
      skippedActions: 0,
      blockedStates: 0,
      failedActions: 0,
    };

    // Load previous application model for change detection (re-explore only)
    let previousContext = this.options.previousContext;
    if (this.options.enableChangeDetection && !previousContext) {
      previousContext = await loadPreviousContext(this.options.output);
    }

    if (previousContext) {
      this.emit({
        type: "knowledge_loaded",
        title: "Loaded previous knowledge",
        description: `${previousContext.pages.length} existing pages`,
        status: "existing",
        metadata: {
          pages: previousContext.pages.length,
          elements: previousContext.elements.length,
          flows: previousContext.flows.length,
        },
      });
    }

    // CLI "continue" resume: reload visited fingerprints and keep exploring
    if (resume) {
      const existing = await this.memory.load();
      if (existing) {
        this.graph = ApplicationGraph.fromSerialized({
          pages: existing.pages,
          transitions: existing.transitions,
        });
        for (const el of existing.elements) this.elements.set(el.id, el);
        this.actions = existing.actions;
        this.visited = new Set(existing.visitedFingerprints);
        meta = { ...existing.exploration, status: "running" };
        this.logger.info("Resuming exploration from persisted memory");
      } else {
        this.logger.info("No memory found; starting fresh exploration");
      }
    }

    this.logger.banner(this.options.url);

    try {
      this.emit({
        type: "browser_initialized",
        title: "Browser Initialization",
        description: "Launching Chromium browser",
        status: "running",
      });
      await this.browser.launch({
        headless: this.options.headless,
        storageState: this.options.storageState,
        timeoutMs: this.options.boundaries.timeoutMs,
        navigationTimeoutMs: Math.max(this.options.boundaries.timeoutMs, 60_000),
      });
      this.logger.ok("Browser initialized");
      this.emit({
        type: "browser_initialized",
        title: "Browser Initialization",
        description: "Launching Chromium browser",
        status: "success",
      });

      const startUrl = resolveStartUrl(this.options.url, this.options.start);
      this.emit({
        type: "navigation_started",
        title: "Navigating to URL",
        description: startUrl,
        status: "running",
      });
      await this.browser.navigate(startUrl);
      this.logger.ok("Application loaded");
      this.emit({
        type: "navigation_completed",
        title: "Navigating to URL",
        description: startUrl,
        status: "success",
      });

      if (this.options.username && this.options.password) {
        await this.tryLogin(this.options.username, this.options.password);
      }

      await this.exploreFromCurrent({
        depth: 0,
        parentId: undefined,
        deadline: wallClockDeadline,
      });

      // Mark remaining exploring pages complete if no pending safe actions
      for (const page of this.graph.listPages()) {
        if (page.status === "EXPLORING" || page.status === "DISCOVERED") {
          this.graph.updatePage(page.id, { status: "COMPLETED" });
        }
      }

      meta = this.buildMeta(meta.startedAt, "completed");
      await this.persist(meta);

      const flows = extractFlows({
        pages: this.graph.listPages(),
        elements: [...this.elements.values()],
        actions: this.actions,
        transitions: this.graph.listTransitions(),
      });
      meta.flowsDiscovered = flows.length;

      for (const flow of flows.slice(0, 20)) {
        this.emit({
          type: "flow_discovered",
          title: "Flow Discovered",
          description: flow.name,
          status: "success",
          metadata: { flowId: flow.id, steps: flow.steps.length },
          statistics: {
            pages: this.graph.listPages().length,
            elements: this.elements.size,
            actions: this.actions.filter((a) => a.status === "EXECUTED").length,
            flows: flows.length,
          },
        });
      }

      const context = buildApplicationContext({
        application: {
          name: this.options.applicationName ?? deriveAppName(this.options.url),
          baseUrl: this.options.url,
        },
        pages: this.graph.listPages(),
        elements: [...this.elements.values()],
        flows,
        transitions: this.graph.listTransitions(),
        actions: this.actions,
        exploration: meta,
      });

      let changeReport: ChangeReport | undefined;
      let changeReportRelativePath: string | undefined;
      let runStatistics: RunStatistics | undefined;

      if (previousContext) {
        changeReport = detectChanges(previousContext, context);
        runStatistics = changeReport.summary;
        const runId = this.options.explorationRunId ?? `exploration-${Date.now()}`;
        changeReportRelativePath = `changes/${runId}.md`;
        this.emitChangeEvents(changeReport);
      }

      const outputFiles = await generateDocumentation(context, this.options.output, {
        framework: this.options.framework ?? "independent",
        applicationName: this.options.applicationName ?? context.application.name,
        applicationUrl: this.options.url,
        status: "completed",
        statistics: {
          pages: meta.pagesDiscovered,
          elements: meta.elementsDiscovered,
          actions: this.actions.filter((a) => a.status === "EXECUTED").length,
          flows: flows.length,
        },
        runs: this.options.explorationRuns ?? [],
        changeReport,
        changeReportRelativePath,
      });
      await this.persist({ ...meta, flowsDiscovered: flows.length });

      this.emit({
        type: "exploration_completed",
        title: "Exploration Completed",
        description: "Exploration completed successfully",
        status: "success",
        statistics: {
          pages: meta.pagesDiscovered,
          elements: meta.elementsDiscovered,
          actions: this.actions.filter((a) => a.status === "EXECUTED").length,
          flows: flows.length,
        },
        metadata: runStatistics ? { changes: runStatistics } : undefined,
      });

      this.logger.summary(meta, outputFiles);
      return {
        outputFiles,
        exploration: meta,
        contextPath: this.options.output,
        changeReport,
        runStatistics,
      };
    } catch (err) {
      meta = this.buildMeta(meta.startedAt, "failed");
      await this.persist(meta).catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "exploration_failed",
        title: "Exploration Failed",
        description: message,
        status: "failed",
      });
      throw err;
    } finally {
      await this.browser.close().catch(() => undefined);
    }
  }

  private async exploreFromCurrent(params: {
    depth: number;
    parentId?: string;
    reachedBy?: { action: string; element?: string };
    deadline: number;
  }): Promise<void> {
    const { boundaries } = this.options;

    if (this.options.shouldAbort?.()) {
      this.logger.log(`[BLOCKED] Exploration aborted by user`);
      return;
    }
    if (Date.now() > params.deadline) {
      this.logger.log(`[BLOCKED] Exploration time budget exceeded`);
      return;
    }
    if (params.depth > boundaries.maxDepth) {
      this.logger.log(`[BLOCKED] Max depth ${boundaries.maxDepth} reached`);
      return;
    }
    if (this.graph.listPages().length >= boundaries.maxPages) {
      this.logger.log(`[BLOCKED] Max pages ${boundaries.maxPages} reached`);
      return;
    }
    if (this.totalActions >= this.maxTotalActions) {
      this.logger.log(`[BLOCKED] Max total actions ${this.maxTotalActions} reached`);
      return;
    }

    await this.browser.waitForStability();
    const state = await this.safeGetState();
    if (!state) {
      this.logger.log(`[FAIL] Could not read page state after navigation`);
      return;
    }

    if (this.isExcludedUrl(state.url)) {
      this.logger.log(`[SKIP] Excluded URL ${state.url}`);
      return;
    }

    const fingerprint = fingerprintState(state);

    if (this.visited.has(fingerprint)) {
      this.logger.verbose(`[STATE] Already visited ${fingerprint.slice(0, 8)}`);
      return;
    }

    let page = this.graph.getPageByFingerprint(fingerprint);
    if (!page) {
      page = this.graph.addPage(
        createPageRecord({
          state,
          fingerprint,
          parentId: params.parentId,
          reachedBy: params.reachedBy,
          status: "EXPLORING",
        }),
      );
      this.logger.log(`[DISCOVER] ${page.name}`);
      this.emit({
        type: "page_discovered",
        title: "Page Discovered",
        description: page.name,
        status: "success",
        metadata: { pageId: page.id, url: page.url, title: page.title },
        applicationName: page.title || page.name,
      });
    } else {
      this.graph.updatePage(page.id, { status: "EXPLORING" });
    }

    this.visited.add(fingerprint);
    this.exploring.add(page.id);
    this.depthByPage.set(page.id, params.depth);

    const discovered = discoverElements(state, page.id).filter((el) => {
      if (!state.modalOpen) return true;
      // When a modal is open, prefer dialog controls (close/confirm) over obscured page chrome
      return (
        /close|ok|confirm|cancel|dismiss|got it/i.test(el.name) ||
        el.attributes["data-testid"]?.includes("modal") ||
        el.attributes["data-testid"]?.includes("close")
      );
    });
    for (const el of discovered) {
      if (!this.elements.has(el.id)) {
        this.elements.set(el.id, el);
        this.logger.verbose(
          `[SELECTOR] ${el.name} → ${el.selectors.preferred.strategy}:${el.selectors.preferred.value ?? el.selectors.preferred.name}`,
        );
      }
    }
    this.graph.updatePage(page.id, {
      elementIds: discovered.map((e) => e.id),
    });
    this.logger.log(`[DISCOVER] ${discovered.length} interactive elements`);
    this.emit({
      type: "elements_discovered",
      title: "Discovering Elements",
      description: `Found ${discovered.length} interactive elements`,
      status: "success",
      metadata: { pageId: page.id, count: discovered.length },
    });

    let actionsOnPage = 0;
    const planned = this.planActions(page, discovered);
    const knownPageNames = new Set(
      this.graph.listPages().map((p) => p.name.toLowerCase()),
    );

    for (const plan of planned) {
      if (Date.now() > params.deadline) break;
      if (actionsOnPage >= boundaries.maxActionsPerPage) break;
      if (this.totalActions >= this.maxTotalActions) {
        this.logger.log(`[BLOCKED] Max total actions ${this.maxTotalActions} reached`);
        break;
      }
      if (this.graph.listPages().length >= boundaries.maxPages) break;

      const safety = classifyAction({
        name: plan.element.name,
        text: plan.element.text,
        type: plan.type,
        elementType: plan.element.type,
        attributes: plan.element.attributes,
      });

      if (
        this.options.boundaries.excludedActions.some((x) =>
          plan.element.name.toLowerCase().includes(x.toLowerCase()),
        )
      ) {
        this.recordAction(plan, page, "SKIPPED", "excluded by configuration");
        continue;
      }

      if (safety === "destructive") {
        this.logger.log(`[SKIP] ${plan.element.name} → destructive action`);
        this.recordAction(plan, page, "SKIPPED", "destructive action", safety);
        this.emit({
          type: "action_skipped",
          title: `Skipping ${plan.element.name}`,
          description: "Destructive action",
          status: "skipped",
          metadata: { element: plan.element.name, reason: "destructive" },
        });
        continue;
      }

      if (safety === "unknown") {
        this.logger.log(`[SKIP] ${plan.element.name} → unknown safety`);
        this.recordAction(plan, page, "SKIPPED", "unknown safety", safety);
        this.emit({
          type: "action_skipped",
          title: `Skipping ${plan.element.name}`,
          description: "Unknown safety",
          status: "skipped",
          metadata: { element: plan.element.name, reason: "unknown safety" },
        });
        continue;
      }

      // Skip nav clicks that only revisit already discovered pages
      if (
        plan.type === "click" &&
        (plan.element.type === "link" ||
          /dashboard|users|reports|settings|home/i.test(plan.element.name))
      ) {
        const targetName = plan.element.name.toLowerCase();
        if (
          knownPageNames.has(targetName) ||
          this.graph.listPages().some((p) => p.name.toLowerCase() === targetName)
        ) {
          continue;
        }
      }

      if (this.alreadyExecutedSimilar(page.id, plan)) {
        continue;
      }

      this.logger.log(
        `[ACTION] ${capitalize(plan.type)} ${plan.element.name}${plan.value ? `: ${mask(plan.value)}` : ""}`,
      );

      const actionTitle = actionEventTitle(plan.type, plan.element.name);
      this.emit({
        type: "action_started",
        title: actionTitle,
        description: plan.value ? `Value: ${mask(plan.value)}` : `Element: "${plan.element.name}"`,
        status: "running",
        metadata: { type: plan.type, element: plan.element.name },
      });

      const ref = toElementReference(plan.element.selectors.preferred);
      let result;
      try {
        if (plan.type === "type") {
          result = await this.browser.type(ref, plan.value || "");
        } else if (plan.type === "select") {
          result = await this.browser.select(ref, plan.value || "");
        } else if (plan.type === "check") {
          result = await this.browser.check(ref, true);
        } else {
          result = await this.browser.click(ref);
        }
      } catch (err) {
        result = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      actionsOnPage++;
      this.totalActions++;

      if (!result.success) {
        this.logger.log(
          `[FAIL] ${plan.element.name} → ${result.error ?? "unknown error"}`,
        );
        this.recordAction(
          plan,
          page,
          "FAILED",
          result.error ?? "Element interaction failed",
          safety,
        );
        this.emit({
          type: "action_failed",
          title: actionTitle,
          description: result.error ?? "Element interaction failed",
          status: "failed",
          metadata: { type: plan.type, element: plan.element.name },
        });
        continue;
      }

      const nextState = await this.safeGetState();
      if (!nextState) {
        this.recordAction(
          plan,
          page,
          "FAILED",
          "Could not observe resulting state (navigation race)",
          safety,
        );
        this.emit({
          type: "action_failed",
          title: actionTitle,
          description: "Could not observe resulting state (navigation race)",
          status: "failed",
          metadata: { type: plan.type, element: plan.element.name },
        });
        continue;
      }
      const nextFp = fingerprintState(nextState);
      let resultingId = page.id;

      if (nextFp !== fingerprint) {
        let nextPage = this.graph.getPageByFingerprint(nextFp);
        if (!nextPage) {
          nextPage = this.graph.addPage(
            createPageRecord({
              state: nextState,
              fingerprint: nextFp,
              parentId: page.id,
              reachedBy: { action: plan.type, element: plan.element.name },
              status: "DISCOVERED",
            }),
          );
          this.logger.log(`[STATE] ${nextPage.name}`);
          this.emit({
            type: "page_discovered",
            title: "Navigating",
            description: nextPage.url || nextPage.name,
            status: "success",
            metadata: {
              pageId: nextPage.id,
              url: nextPage.url,
              note: "New page discovered",
            },
            applicationName: nextPage.title || nextPage.name,
          });
        }
        resultingId = nextPage.id;
        this.graph.addTransition({
          from: page.id,
          action: { type: plan.type, element: plan.element.name },
          to: nextPage.id,
        });

        this.recordAction(plan, page, "EXECUTED", undefined, safety, resultingId);
        this.emit({
          type: "action_completed",
          title: actionTitle,
          description: `Element: "${plan.element.name}"`,
          status: "success",
          metadata: { type: plan.type, element: plan.element.name, resultingStateId: resultingId },
        });

        if (!this.visited.has(nextFp)) {
          await this.exploreFromCurrent({
            depth: params.depth + 1,
            parentId: page.id,
            reachedBy: { action: plan.type, element: plan.element.name },
            deadline: params.deadline,
          });
        }

        // Return to parent state when possible
        await this.returnToPage(page, startUrlFallback(this.options));
        const restored = await this.safeGetState();
        if (!restored || fingerprintState(restored) !== fingerprint) {
          this.logger.verbose(
            `[STATE] Could not restore ${page.name}; stopping further actions on this page`,
          );
          break;
        }
      } else {
        this.recordAction(plan, page, "EXECUTED", undefined, safety, resultingId);
        this.emit({
          type: "action_completed",
          title: actionTitle,
          description: `Element: "${plan.element.name}"`,
          status: "success",
          metadata: { type: plan.type, element: plan.element.name },
        });
      }

      if (this.totalActions % 10 === 0) {
        await this.persistLight(this.buildMeta(new Date().toISOString(), "running"));
      }
    }

    this.graph.updatePage(page.id, { status: "COMPLETED" });
    this.exploring.delete(page.id);
  }

  private async persistLight(meta: ExplorationMeta): Promise<void> {
    // Persist without recomputing flows on every action
    await this.memory.save({
      application: {
        name: deriveAppName(this.options.url),
        baseUrl: this.options.url,
      },
      pages: this.graph.listPages(),
      elements: [...this.elements.values()],
      flows: [],
      actions: this.actions,
      transitions: this.graph.listTransitions(),
      exploration: meta,
      visitedFingerprints: [...this.visited],
    });
  }

  private planActions(
    page: Page,
    elements: Element[],
  ): Array<{ type: Action["type"]; element: Element; value?: string }> {
    const plans: Array<{ type: Action["type"]; element: Element; value?: string }> = [];
    const testData = { ...DEFAULT_TEST_DATA, ...this.options.testData };

    for (const el of elements) {
      if (el.type === "input" || el.type === "textarea") {
        const authValue = resolveAuthTypedValue(el.name, el.attributes, {
          username: this.options.username,
          password: this.options.password,
          testData,
        });
        if (authValue !== undefined) {
          plans.push({ type: "type", element: el, value: authValue });
        } else if (/search/i.test(el.name)) {
          plans.push({ type: "type", element: el, value: testData.search });
        } else if (/phone|tel/i.test(el.name + (el.attributes.type || ""))) {
          plans.push({ type: "type", element: el, value: testData.phone });
        } else if ((el.attributes.type || "") === "number") {
          plans.push({ type: "type", element: el, value: testData.number });
        } else {
          // Avoid matching "username" with a bare /name/ check
          const isPersonName =
            /\b(full.?name|first.?name|last.?name|display.?name|surname|given.?name)\b/i.test(
              el.name,
            ) || /^(name|fullname)$/i.test(el.name);
          plans.push({
            type: "type",
            element: el,
            value: isPersonName ? testData.name : testData.text,
          });
        }
        continue;
      }

      // Only explore one representative select option
      if (el.type === "select" || el.type === "dropdown") {
        const options = (el.options || []).filter((o) => o && !/^select/i.test(o));
        const pick = options[0] || options[1];
        if (pick) {
          plans.push({ type: "select", element: el, value: pick });
        }
        continue;
      }

      if (el.type === "checkbox" || el.type === "radio") {
        plans.push({ type: "check", element: el });
        continue;
      }

      // Limit repeated row actions (Edit User 1/2/3...)
      if (/^edit$/i.test(el.name) || /^edit\b/i.test(el.name)) {
        if (plans.some((p) => p.type === "click" && /^edit$/i.test(p.element.name))) {
          continue;
        }
      }
      if (el.type === "table") {
        continue;
      }
      if (
        el.type === "link" ||
        el.type === "button" ||
        el.type === "tab" ||
        el.type === "menu" ||
        el.type === "pagination" ||
        el.type === "other"
      ) {
        // Skip clicking the nav item for the page we are already on
        if (el.name.toLowerCase() === page.name.toLowerCase()) {
          continue;
        }
        plans.push({ type: "click", element: el });
      }
    }

    // Prioritize nav links/tabs before form submits
    return plans.sort((a, b) => priority(a) - priority(b));
  }

  private alreadyExecutedSimilar(
    pageId: string,
    plan: { type: string; element: Element; value?: string },
  ): boolean {
    // Navigation-style clicks are globally unique by element name to avoid
    // re-walking the same links from every page (combinatorial explosion).
    const isNavClick =
      plan.type === "click" &&
      (plan.element.type === "link" ||
        plan.element.type === "tab" ||
        plan.element.type === "menu" ||
        /dashboard|users|reports|settings|home|nav/i.test(plan.element.name));

    return this.actions.some((a) => {
      if (a.type !== plan.type) return false;
      if ((a.value ?? "") !== (plan.value ?? "")) return false;
      if (!(a.status === "EXECUTED" || a.status === "SKIPPED" || a.status === "FAILED")) {
        return false;
      }
      if (isNavClick) {
        return a.elementName === plan.element.name;
      }
      return a.pageId === pageId && a.elementName === plan.element.name;
    });
  }

  private recordAction(
    plan: { type: Action["type"]; element: Element; value?: string },
    page: Page,
    status: Action["status"],
    reason?: string,
    safety: Action["safety"] = "safe",
    resultingStateId?: string,
  ): void {
    this.actions.push({
      id: `${page.id}:${slugify(plan.element.name)}:${this.actions.length}`,
      type: plan.type,
      elementId: plan.element.id,
      elementName: plan.element.name,
      pageId: page.id,
      safety,
      status,
      value: plan.value,
      reason,
      resultingStateId,
      timestamp: new Date().toISOString(),
    });
  }

  private async safeGetState() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.browser.waitForStability();
        return await this.browser.getState();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const navigationRace =
          /Execution context was destroyed|most likely because of a navigation|Cannot find context|frame was detached/i.test(
            message,
          );
        if (!navigationRace || attempt === 2) {
          this.logger.log(`[FAIL] getState: ${message}`);
          return null;
        }
        this.logger.verbose(`[RETRY] getState after navigation (${attempt + 1}/3)`);
      }
    }
    return null;
  }

  private async returnToPage(page: Page, fallbackUrl: string): Promise<void> {
    try {
      let target = page.url;
      if (target.startsWith("#") || (target.startsWith("/") && target.includes("#"))) {
        const base = new URL(this.options.url);
        target = `${base.origin}${target.startsWith("/") ? "" : "/"}${target}`;
      } else if (target.startsWith("/")) {
        const base = new URL(this.options.url);
        target = `${base.origin}${target}`;
      } else if (!/^https?:/i.test(target)) {
        target = fallbackUrl;
      }

      if (page.url.includes("#") || page.url.length > 1) {
        await this.browser.navigate(target);
        return;
      }

      await this.browser.goBack();
    } catch {
      await this.browser.navigate(fallbackUrl).catch(() => undefined);
    }
  }

  private async tryLogin(username: string, password: string): Promise<void> {
    // SPAs often hydrate the login form after domcontentloaded — poll briefly.
    const waitMs = Math.max(this.options.boundaries.timeoutMs ?? 10_000, 15_000);
    const deadline = Date.now() + waitMs;
    let lastState = await this.safeGetState();

    while (Date.now() < deadline) {
      const state = await this.safeGetState();
      if (state) {
        lastState = state;
        const userField = state.interactiveElements.find(isUsernameField);
        const passField = state.interactiveElements.find(isPasswordField);
        if (userField && passField) {
          const submit = state.interactiveElements.find(isLoginSubmit);
          const elements = discoverElements(state, "login-temp");
          const userEl = elements.find(
            (e) =>
              e.attributes.name === userField.attributes.name ||
              e.attributes.id === userField.attributes.id ||
              e.accessibleName === userField.accessibleName ||
              /user|email|login/i.test(e.name),
          );
          const passEl = elements.find(
            (e) =>
              e.attributes.type === "password" ||
              e.attributes.name === passField.attributes.name ||
              /pass/i.test(e.name),
          );
          const submitEl = submit
            ? elements.find(
                (e) =>
                  e.accessibleName === submit.accessibleName ||
                  e.name === submit.accessibleName ||
                  e.name === submit.text ||
                  /log\s?in|sign\s?in|continue|submit/i.test(e.name),
              )
            : elements.find((e) => /log\s?in|sign\s?in|continue|submit/i.test(e.name));

          if (!userEl || !passEl) {
            this.logger.info("Credentials provided but login fields not mapped; continuing");
            return;
          }

          const userResult = await this.browser.type(
            toElementReference(userEl.selectors.preferred),
            username,
          );
          const passResult = await this.browser.type(
            toElementReference(passEl.selectors.preferred),
            password,
          );
          if (!userResult.success || !passResult.success) {
            this.logger.info(
              `Credential fill failed (${userResult.error || passResult.error || "unknown"}); continuing`,
            );
            return;
          }

          this.emit({
            type: "action_completed",
            title: "Filling Form",
            description: "Username and password fields",
            status: "success",
          });

          if (submitEl) {
            this.emit({
              type: "action_started",
              title: `Clicking ${submitEl.name}`,
              description: `Element: "${submitEl.name}"`,
              status: "running",
            });
            await this.browser.click(toElementReference(submitEl.selectors.preferred));
            await this.browser.waitForStability(2_000);
            this.logger.ok("Authentication attempted");
            this.emit({
              type: "action_completed",
              title: `Clicking ${submitEl.name}`,
              description: "Authentication attempted",
              status: "success",
            });
          } else {
            this.logger.info("Credentials filled but no login submit control found");
          }
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!lastState) {
      this.logger.info("Credentials provided but page state unavailable; continuing");
      return;
    }
    this.logger.info("Credentials provided but login fields not detected; continuing");
  }

  private isExcludedUrl(url: string): boolean {
    return this.options.boundaries.excludedUrls.some((pattern) => {
      try {
        return new RegExp(pattern).test(url) || url.includes(pattern);
      } catch {
        return url.includes(pattern);
      }
    });
  }

  private buildMeta(
    startedAt: string,
    status: ExplorationMeta["status"],
  ): ExplorationMeta {
    const skipped = this.actions.filter((a) => a.status === "SKIPPED").length;
    const failed = this.actions.filter((a) => a.status === "FAILED").length;
    const blocked = this.graph.listPages().filter((p) => p.status === "BLOCKED").length;
    return {
      startedAt,
      completedAt: status === "completed" || status === "failed" ? new Date().toISOString() : undefined,
      status,
      pagesDiscovered: this.graph.listPages().length,
      elementsDiscovered: this.elements.size,
      flowsDiscovered: 0,
      selectorsCaptured: this.elements.size,
      skippedActions: skipped,
      blockedStates: blocked,
      failedActions: failed,
    };
  }

  private async persist(meta: ExplorationMeta): Promise<void> {
    await this.memory.save({
      application: {
        name: deriveAppName(this.options.url),
        baseUrl: this.options.url,
      },
      pages: this.graph.listPages(),
      elements: [...this.elements.values()],
      flows: extractFlows({
        pages: this.graph.listPages(),
        elements: [...this.elements.values()],
        actions: this.actions,
        transitions: this.graph.listTransitions(),
      }),
      actions: this.actions,
      transitions: this.graph.listTransitions(),
      exploration: meta,
      visitedFingerprints: [...this.visited],
    });
  }
}

function priority(plan: { type: string; element: Element }): number {
  if (plan.element.type === "link" || plan.element.type === "tab") return 1;
  if (plan.element.type === "pagination" || plan.element.type === "menu") return 2;
  if (plan.type === "type" || plan.type === "select" || plan.type === "check") return 3;
  if (/save|submit|create|login/i.test(plan.element.name)) return 5;
  return 4;
}

function resolveStartUrl(base: string, start?: string): string {
  if (!start) return base;
  if (/^https?:/i.test(start)) return start;
  const u = new URL(base);
  u.pathname = start.startsWith("/") ? start : `/${start}`;
  return u.toString();
}

function startUrlFallback(options: ExploreOptions): string {
  return resolveStartUrl(options.url, options.start);
}

function deriveAppName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "application";
  }
}

async function loadPreviousContext(outputDir: string): Promise<ApplicationContext | undefined> {
  try {
    const raw = await readFile(path.join(outputDir, "application.json"), "utf8");
    const parsed = JSON.parse(raw);
    return ApplicationContextSchema.parse(parsed);
  } catch {
    return undefined;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mask(value: string): string {
  if (/pass|secret|token/i.test(value)) return "***";
  return value;
}

function actionEventTitle(type: string, elementName: string): string {
  if (type === "type") return `Filling Form — ${elementName}`;
  if (type === "select") return `Selecting — ${elementName}`;
  if (type === "check") return `Checking — ${elementName}`;
  return `Clicking ${elementName}`;
}

class Logger {
  constructor(
    private verboseEnabled: boolean,
    private jsonMode: boolean,
  ) {}

  banner(url: string): void {
    if (this.jsonMode) return;
    console.log("Application Explorer\n");
    console.log("Starting exploration...");
    console.log(`URL: ${url}\n`);
  }

  ok(message: string): void {
    if (this.jsonMode) return;
    console.log(`✓ ${message}`);
  }

  info(message: string): void {
    if (this.jsonMode) return;
    console.log(message);
  }

  log(message: string): void {
    if (this.jsonMode) return;
    console.log(message);
  }

  verbose(message: string): void {
    if (this.jsonMode || !this.verboseEnabled) return;
    console.log(message);
  }

  summary(meta: ExplorationMeta, files: string[]): void {
    if (this.jsonMode) {
      console.log(
        JSON.stringify(
          {
            status: meta.status,
            pagesDiscovered: meta.pagesDiscovered,
            elementsDiscovered: meta.elementsDiscovered,
            flowsDiscovered: meta.flowsDiscovered,
            selectorsCaptured: meta.selectorsCaptured,
            skippedActions: meta.skippedActions,
            blockedStates: meta.blockedStates,
            failedActions: meta.failedActions,
            output: files,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log("\nExploring...\n");
    console.log(`Pages discovered:       ${meta.pagesDiscovered}`);
    console.log(`Elements discovered:    ${meta.elementsDiscovered}`);
    console.log(`Flows discovered:        ${meta.flowsDiscovered}`);
    console.log(`Selectors captured:     ${meta.selectorsCaptured}`);
    console.log(`\nSkipped actions:         ${meta.skippedActions}`);
    console.log(`Blocked states:          ${meta.blockedStates}`);
    console.log(`Failed actions:          ${meta.failedActions}`);
    console.log("\nExploration completed.\n");
    console.log("Output:");
    for (const f of files) {
      console.log(path.normalize(f));
    }
  }
}

export async function loadStatus(memoryDir: string) {
  const store = new MemoryStore(memoryDir);
  return store.load();
}
