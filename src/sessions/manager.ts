import { EventEmitter } from "node:events";
import path from "node:path";
import { PlaywrightAdapter } from "../browser/playwright-adapter.js";
import type { Db } from "../db/client.js";
import { Explorer } from "../explorer/index.js";
import {
  DEFAULT_BOUNDARIES,
  DEFAULT_TEST_DATA,
  applyStabilityProfile,
  type ExploreOptions,
  type StabilityProfile,
  type AuthMode,
} from "../models/index.js";
import { createSessionId, deriveApplicationName, SessionStore } from "./store.js";
import type {
  CreateSessionInput,
  ExplorationEvent,
  ExplorationEventPayload,
  ExplorationRun,
  ExplorationSession,
  Framework,
  ListSessionsFilter,
  ResumeSessionInput,
  RunStatistics,
  SessionStatistics,
} from "./types.js";
import {
  CONTEXT_DOCUMENTS,
  FRAMEWORK_LABELS,
  IMPLEMENTED_FRAMEWORKS,
} from "./types.js";
import { frameworkFileName } from "../frameworks/index.js";

interface ActiveRun {
  abortRequested: boolean;
  paused: boolean;
  runId: string;
}

export class SessionManager {
  private readonly store: SessionStore;
  private readonly bus = new EventEmitter();
  private readonly active = new Map<string, ActiveRun>();
  private readonly sessionCache = new Map<string, ExplorationSession>();
  private readonly eventsCache = new Map<string, ExplorationEvent[]>();
  private readonly eventQueues = new Map<string, Promise<void>>();
  private eventSeq = 0;

  constructor(private readonly dataRoot: string, db?: Db) {
    this.store = new SessionStore(dataRoot, db);
    this.bus.setMaxListeners(100);
  }

  getStore(): SessionStore {
    return this.store;
  }

  async listSessions(filter?: ListSessionsFilter): Promise<ExplorationSession[]> {
    const fromDb = await this.store.listSessions(filter);
    for (const s of fromDb) {
      this.sessionCache.set(s.id, s);
    }
    return fromDb;
  }

  async getSession(sessionId: string): Promise<ExplorationSession | null> {
    const cached = this.sessionCache.get(sessionId);
    if (cached) return cached;
    const loaded = await this.store.loadSession(sessionId);
    if (loaded) this.sessionCache.set(sessionId, loaded);
    return loaded;
  }

  async getEvents(sessionId: string): Promise<ExplorationEvent[]> {
    const cached = this.eventsCache.get(sessionId);
    if (cached) return cached;
    const events = await this.store.loadEvents(sessionId);
    this.eventsCache.set(sessionId, events);
    return events;
  }

  async listRuns(sessionId: string): Promise<ExplorationRun[]> {
    return this.store.listRuns(sessionId);
  }

  async getGraph(sessionId: string): Promise<{
    pages: Array<Record<string, unknown>>;
    transitions: Array<Record<string, unknown>>;
  }> {
    return this.store.loadGraph(sessionId);
  }

  onSessionEvent(
    sessionId: string,
    listener: (event: ExplorationEvent) => void,
  ): () => void {
    const key = `event:${sessionId}`;
    this.bus.on(key, listener);
    return () => this.bus.off(key, listener);
  }

  onSessionUpdated(listener: (session: ExplorationSession) => void): () => void {
    this.bus.on("session", listener);
    return () => this.bus.off("session", listener);
  }

  async startExploration(
    input: CreateSessionInput,
    opts: { wait?: boolean } = {},
  ): Promise<ExplorationSession> {
    const url = normalizeUrl(input.applicationUrl);
    if (!url) {
      throw new Error("A valid application URL is required (include http:// or https://)");
    }
    if (!input.ownerUserId?.trim()) {
      throw new Error("ownerUserId is required");
    }

    const framework = normalizeFramework(input.framework);
    const profile = normalizeStabilityProfile(input.stabilityProfile);
    const authMode = normalizeAuthMode(input.authMode, input.username, input.storageState);
    const domainAllowlist =
      input.domainAllowlist?.map((h) => h.trim()).filter(Boolean) ??
      [safeHostname(url)].filter(Boolean);

    const boundaries = applyStabilityProfile(profile, {
      maxPages: input.maxPages,
      maxDepth: input.maxDepth,
      maxDurationMs: input.maxDurationMs,
      domainAllowlist,
      exploreOpenShadow: input.exploreOpenShadow,
      exploreSameOriginFrames: input.exploreSameOriginFrames,
      dismissConsent: input.dismissConsent,
      authMode,
    });

    const id = createSessionId();
    await this.store.ensureSession(id);
    const now = new Date().toISOString();

    const runId = await this.store.nextRunId(id);
    const run: ExplorationRun = {
      id: runId,
      sessionId: id,
      type: "initial",
      startedAt: now,
      status: "running",
      statistics: emptyRunStats(),
    };

    const session: ExplorationSession = {
      id,
      applicationName: deriveApplicationName(url),
      applicationUrl: url,
      username: input.username?.trim() || undefined,
      framework,
      status: "created",
      createdAt: now,
      updatedAt: now,
      currentExplorationId: runId,
      statistics: { pages: 0, elements: 0, actions: 0, flows: 0, skipped: 0 },
      contextPath: this.store.contextDir(id),
      memoryPath: this.store.memoryDir(id),
      ownerUserId: input.ownerUserId.trim(),
      stabilityProfile: boundaries.stabilityProfile,
      authMode: boundaries.authMode,
      domainAllowlist: boundaries.domainAllowlist,
      exploreOpenShadow: boundaries.exploreOpenShadow,
      exploreSameOriginFrames: boundaries.exploreSameOriginFrames,
      dismissConsent: boundaries.dismissConsent,
      docGenerationMode: input.docGenerationMode === "ai" ? "ai" : "system",
      aiModules: input.aiModules?.length ? input.aiModules : input.docGenerationMode === "ai" ? ["docs"] : [],
    };

    // Session row must exist before runs (FK exploration_runs.session_id).
    this.sessionCache.set(id, session);
    await this.store.saveSession(session);
    await this.store.saveRun(run);
    this.eventsCache.set(id, []);
    await this.store.clearEvents(id);
    this.publishSession(session);

    const runner = this.runExploration(session.id, runId, "initial", {
      url,
      username: input.username,
      password: input.password,
      storageState: input.storageState,
      headless: input.headless !== false && authMode !== "manual-wait",
      maxPages: boundaries.maxPages,
      maxDepth: boundaries.maxDepth,
      maxDurationMs: boundaries.maxDurationMs,
      boundaries,
    }).catch((err) => {
      console.error(`[session ${id}] exploration runner failed:`, err);
    });

    if (opts.wait) await runner;
    else void runner;

    return session;
  }

  /**
   * Resume / re-explore an existing completed (or failed) session.
   * Creates a new ExplorationRun inside the same session — does not create a new session.
   */
  async resumeExploration(
    sessionId: string,
    input: ResumeSessionInput = {},
    opts: { wait?: boolean } = {},
  ): Promise<ExplorationSession> {
    const existing = await this.getSession(sessionId);
    if (!existing) throw new Error("Session not found");
    if (this.active.has(sessionId)) throw new Error("Session is already running");
    if (existing.status === "exploring" || existing.status === "re-exploring" || existing.status === "initializing") {
      throw new Error("Session is already exploring");
    }

    const now = new Date().toISOString();
    const runId = await this.store.nextRunId(sessionId);
    const run: ExplorationRun = {
      id: runId,
      sessionId,
      type: "resume",
      startedAt: now,
      status: "running",
      statistics: emptyRunStats(),
    };
    await this.store.saveRun(run);

    // Clear live event canvas for the new run (history remains in prior runs via change reports)
    this.eventsCache.set(sessionId, []);
    await this.store.clearEvents(sessionId);

    const session = await this.updateSession(sessionId, {
      status: "re-exploring",
      currentExplorationId: runId,
      error: undefined,
      completedAt: undefined,
      startedAt: now,
    });

    const resumeDuration =
      input.maxDurationMs ?? Math.max(DEFAULT_BOUNDARIES.maxDurationMs, 600_000);

    const runner = this.runExploration(sessionId, runId, "resume", {
      url: existing.applicationUrl,
      username: existing.username,
      password: input.password,
      headless: input.headless !== false,
      maxPages: input.maxPages,
      maxDepth: input.maxDepth,
      maxDurationMs: resumeDuration,
      boundaries: applyStabilityProfile(existing.stabilityProfile ?? "balanced", {
        maxPages: input.maxPages,
        maxDepth: input.maxDepth,
        maxDurationMs: resumeDuration,
        domainAllowlist: existing.domainAllowlist,
        exploreOpenShadow: existing.exploreOpenShadow,
        exploreSameOriginFrames: existing.exploreSameOriginFrames,
        dismissConsent: existing.dismissConsent,
        authMode: existing.authMode,
      }),
    }).catch((err) => {
      console.error(`[session ${sessionId}] resume runner failed:`, err);
    });

    if (opts.wait) await runner;
    else void runner;

    return session;
  }

  async retrySession(sessionId: string, password?: string): Promise<ExplorationSession> {
    return this.resumeExploration(sessionId, { password });
  }

  async stopExploration(sessionId: string): Promise<ExplorationSession> {
    const active = this.active.get(sessionId);
    if (!active) throw new Error("No active exploration to stop");
    if (!active.abortRequested) {
      active.abortRequested = true;
      this.enqueueEvent(sessionId, {
        type: "exploration_stopped",
        title: "Stopping exploration…",
        description: "Finishing the current action, then stopping",
        status: "running",
      });
    }
    // Keep live status until the runner exits — avoids Resume while still active
    return this.requireSession(sessionId);
  }

  async pauseExploration(sessionId: string): Promise<ExplorationSession> {
    const active = this.active.get(sessionId);
    if (!active) throw new Error("No active exploration to pause");
    active.paused = true;
    if (!active.abortRequested) {
      active.abortRequested = true;
      this.enqueueEvent(sessionId, {
        type: "exploration_paused",
        title: "Pausing exploration…",
        description: "Finishing the current action, then pausing",
        status: "running",
      });
    }
    // Keep live status until the runner exits — avoids Resume while still active
    return this.requireSession(sessionId);
  }

  private async runExploration(
    sessionId: string,
    runId: string,
    runType: "initial" | "resume",
    creds: {
      url: string;
      username?: string;
      password?: string;
      storageState?: string;
      headless: boolean;
      maxPages?: number;
      maxDepth?: number;
      maxDurationMs?: number;
      boundaries?: ReturnType<typeof applyStabilityProfile>;
    },
  ): Promise<void> {
    this.active.set(sessionId, { abortRequested: false, paused: false, runId });

    let session = await this.requireSession(sessionId);
    const statusOnStart = runType === "resume" ? "re-exploring" : "initializing";
    session = await this.updateSession(session.id, {
      status: statusOnStart,
      startedAt: session.startedAt ?? new Date().toISOString(),
      error: undefined,
      completedAt: undefined,
      currentExplorationId: runId,
    });

    const runs = await this.store.listRuns(sessionId);
    const boundaries =
      creds.boundaries ??
      applyStabilityProfile(session.stabilityProfile ?? "balanced", {
        maxPages: creds.maxPages,
        maxDepth: creds.maxDepth,
        maxDurationMs: creds.maxDurationMs,
        domainAllowlist: session.domainAllowlist,
        exploreOpenShadow: session.exploreOpenShadow,
        exploreSameOriginFrames: session.exploreSameOriginFrames,
        dismissConsent: session.dismissConsent,
        authMode: session.authMode,
      });

    const options: ExploreOptions = {
      url: creds.url,
      output: this.store.contextDir(sessionId),
      memoryDir: this.store.memoryDir(sessionId),
      username: creds.username,
      password: creds.password,
      storageState: creds.storageState,
      headless: creds.headless,
      json: true,
      verbose: false,
      framework: session.framework,
      applicationName: session.applicationName,
      explorationRunId: runId,
      explorationRuns: runs,
      enableChangeDetection: runType === "resume",
      shouldAbort: () => this.active.get(sessionId)?.abortRequested === true,
      boundaries: {
        ...DEFAULT_BOUNDARIES,
        ...boundaries,
        maxPages: creds.maxPages ?? boundaries.maxPages,
        maxDepth: creds.maxDepth ?? boundaries.maxDepth,
        maxDurationMs: creds.maxDurationMs ?? boundaries.maxDurationMs,
      },
      testData: { ...DEFAULT_TEST_DATA },
    };

    const explorer = new Explorer(options, new PlaywrightAdapter(), (payload) => {
      this.enqueueEvent(sessionId, payload);
    });

    try {
      if (runType === "initial") {
        await this.updateSession(sessionId, { status: "exploring" });
      }
      // Hybrid resume: load memory + visited, prefer new/unfinished areas; change detection still on.
      const result = await explorer.run(runType === "resume");
      await this.flushEventQueue(sessionId);

      const aborted = this.active.get(sessionId)?.abortRequested === true;
      const wasPause = this.active.get(sessionId)?.paused === true;
      const events = this.eventsCache.get(sessionId) ?? [];
      const runStats: RunStatistics = result.runStatistics ?? {
        ...emptyRunStats(),
        pagesDiscovered: result.exploration.pagesDiscovered,
        elementsDiscovered: result.exploration.elementsDiscovered,
      };

      const completedAt = new Date().toISOString();
      await this.store.saveRun({
        id: runId,
        sessionId,
        type: runType,
        startedAt: session.startedAt ?? completedAt,
        completedAt,
        status: aborted ? "failed" : "completed",
        statistics: runStats,
        changeReportPath: result.changeReport
          ? `changes/${runId}.md`
          : undefined,
      });

      const skipped =
        result.exploration.skippedActions ??
        events.filter((e) => e.type === "action_skipped").length;

      if (aborted) {
        this.enqueueEvent(sessionId, {
          type: wasPause ? "exploration_paused" : "exploration_stopped",
          title: wasPause ? "Exploration paused" : "Exploration stopped",
          status: "skipped",
        });
        await this.flushEventQueue(sessionId);
      }

      await this.updateSession(sessionId, {
        status: aborted ? "paused" : "completed",
        completedAt: aborted ? undefined : completedAt,
        error: undefined,
        latestChanges: aborted ? undefined : result.runStatistics,
        statistics: {
          pages: result.exploration.pagesDiscovered,
          elements: result.exploration.elementsDiscovered,
          actions: events.filter((e) => e.type === "action_completed").length,
          flows: result.exploration.flowsDiscovered,
          skipped,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.flushEventQueue(sessionId).catch(() => undefined);
      const aborted = this.active.get(sessionId)?.abortRequested === true;
      const completedAt = new Date().toISOString();
      await this.store
        .saveRun({
          id: runId,
          sessionId,
          type: runType,
          startedAt: session.startedAt ?? completedAt,
          completedAt,
          status: "failed",
          statistics: emptyRunStats(),
        })
        .catch(() => undefined);
      await this.updateSession(sessionId, {
        status: aborted ? "paused" : "failed",
        completedAt: aborted ? undefined : completedAt,
        error: aborted ? undefined : message,
      }).catch((updateErr) => {
        console.error(`[session ${sessionId}] failed to persist failure state:`, updateErr);
      });
    } finally {
      this.active.delete(sessionId);
    }
  }

  private enqueueEvent(sessionId: string, payload: ExplorationEventPayload): void {
    const prev = this.eventQueues.get(sessionId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(() => this.handleEngineEvent(sessionId, payload));
    this.eventQueues.set(sessionId, next);
  }

  private async flushEventQueue(sessionId: string): Promise<void> {
    await (this.eventQueues.get(sessionId) ?? Promise.resolve());
  }

  private async handleEngineEvent(
    sessionId: string,
    payload: ExplorationEventPayload,
  ): Promise<void> {
    const event: ExplorationEvent = {
      id: `evt-${++this.eventSeq}-${Date.now().toString(36)}`,
      sessionId,
      timestamp: new Date().toISOString(),
      type: payload.type,
      title: payload.title,
      description: payload.description,
      metadata: payload.metadata,
      status: payload.status,
    };

    const list = this.eventsCache.get(sessionId) ?? (await this.store.loadEvents(sessionId));
    list.push(event);
    this.eventsCache.set(sessionId, list);
    void this.store.appendEvent(sessionId, event).catch(() => undefined);

    this.bus.emit(`event:${sessionId}`, event);

    const session = this.sessionCache.get(sessionId) ?? (await this.store.loadSession(sessionId));
    if (!session) return;
    if (!this.sessionCache.has(sessionId)) this.sessionCache.set(sessionId, session);

    const patch: Partial<ExplorationSession> = {};

    if (payload.statistics) {
      patch.statistics = mergeStats(session.statistics, payload.statistics);
    }

    if (payload.applicationName) {
      const currentIsGeneric =
        session.applicationName === deriveApplicationName(session.applicationUrl);
      if (currentIsGeneric) {
        const improved = deriveApplicationName(session.applicationUrl, payload.applicationName);
        if (improved !== session.applicationName) {
          patch.applicationName = improved;
        }
      }
    }

    if (payload.type === "browser_initialized" && payload.status === "running") {
      if (session.status !== "re-exploring") patch.status = "initializing";
    } else if (payload.type === "browser_initialized" && payload.status === "success") {
      if (session.status !== "re-exploring") patch.status = "exploring";
    } else if (payload.type === "exploration_failed") {
      patch.status = "failed";
      patch.error = payload.description;
      patch.completedAt = new Date().toISOString();
    }

    if (Object.keys(patch).length > 0) {
      await this.updateSession(sessionId, patch);
    }
  }

  private async requireSession(sessionId: string): Promise<ExplorationSession> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return session;
  }

  async updateSession(
    sessionId: string,
    patch: Partial<ExplorationSession>,
  ): Promise<ExplorationSession> {
    const current = await this.requireSession(sessionId);
    const next: ExplorationSession = {
      ...current,
      ...patch,
      id: current.id,
      updatedAt: new Date().toISOString(),
      statistics: patch.statistics
        ? { ...current.statistics, ...patch.statistics }
        : current.statistics,
    };
    if ("error" in patch && patch.error === undefined) delete next.error;
    if ("completedAt" in patch && patch.completedAt === undefined) delete next.completedAt;
    if ("latestChanges" in patch && patch.latestChanges === undefined) delete next.latestChanges;

    this.sessionCache.set(sessionId, next);
    await this.store.saveSession(next);
    this.publishSession(next);
    return next;
  }

  private publishSession(session: ExplorationSession): void {
    this.bus.emit("session", session);
  }

  async listDocuments(sessionId: string): Promise<
    Array<{
      name: string;
      label: string;
      kind: "markdown" | "json";
      description?: string;
      available: boolean;
      size?: number;
    }>
  > {
    const session = await this.getSession(sessionId);
    const docs = [];
    for (const doc of CONTEXT_DOCUMENTS) {
      const available = await this.store.documentExists(sessionId, doc.name);
      const size = available ? (await this.store.documentSize(sessionId, doc.name)) ?? undefined : undefined;
      docs.push({ ...doc, available, size });
    }

    // Framework-specific doc
    if (session && session.framework !== "independent") {
      const name = `framework/${frameworkFileName(session.framework)}`;
      const available = await this.store.documentExists(sessionId, name);
      const size = available ? (await this.store.documentSize(sessionId, name)) ?? undefined : undefined;
      docs.push({
        name,
        label: FRAMEWORK_LABELS[session.framework],
        kind: "markdown" as const,
        description: `${FRAMEWORK_LABELS[session.framework]} selector mappings`,
        available,
        size,
      });
    }

    // Change reports
    const changes = await this.store.listChangeReports(sessionId);
    for (const name of changes) {
      const size = (await this.store.documentSize(sessionId, name)) ?? undefined;
      docs.push({
        name,
        label: path.basename(name),
        kind: "markdown" as const,
        description: "Exploration change report",
        available: true,
        size,
      });
    }

    return docs;
  }

  async removeContext(sessionId: string): Promise<{ removed: number }> {
    if (this.active.has(sessionId)) {
      throw new Error("Cannot remove context while exploration is running");
    }
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");
    const removed = await this.store.clearContext(sessionId);
    this.publishSession(session);
    return { removed };
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.active.has(sessionId)) {
      throw new Error("Cannot delete a session while exploration is running");
    }
    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Session not found");
    await this.store.deleteSession(sessionId);
    this.sessionCache.delete(sessionId);
    this.eventsCache.delete(sessionId);
    this.eventQueues.delete(sessionId);
    this.bus.emit("session-deleted", sessionId);
  }
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeFramework(raw?: Framework | string): Framework {
  if (!raw) return "independent";
  if (IMPLEMENTED_FRAMEWORKS.includes(raw as Framework)) return raw as Framework;
  // Accept labels that aren't implemented yet but store as independent for generation
  const known = Object.keys(FRAMEWORK_LABELS) as Framework[];
  if (known.includes(raw as Framework)) {
    // Persist selection even if generator not ready — docs will omit framework file
    return raw as Framework;
  }
  return "independent";
}

function normalizeStabilityProfile(raw?: string): StabilityProfile {
  if (raw === "fast" || raw === "deep" || raw === "balanced") return raw;
  return "balanced";
}

function normalizeAuthMode(
  raw?: string,
  username?: string,
  storageState?: string,
): AuthMode {
  if (
    raw === "none" ||
    raw === "credentials" ||
    raw === "storage-state" ||
    raw === "manual-wait"
  ) {
    return raw;
  }
  if (storageState) return "storage-state";
  if (username) return "credentials";
  return "none";
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function mergeStats(
  current: SessionStatistics,
  patch: Partial<SessionStatistics>,
): SessionStatistics {
  return {
    pages: patch.pages ?? current.pages,
    elements: patch.elements ?? current.elements,
    actions: patch.actions ?? current.actions,
    flows: patch.flows ?? current.flows,
    skipped: patch.skipped ?? current.skipped ?? 0,
  };
}

function emptyRunStats(): RunStatistics {
  return {
    pagesDiscovered: 0,
    pagesAdded: 0,
    pagesRemoved: 0,
    elementsDiscovered: 0,
    elementsAdded: 0,
    elementsRemoved: 0,
    selectorsChanged: 0,
    flowsAdded: 0,
    flowsChanged: 0,
  };
}
