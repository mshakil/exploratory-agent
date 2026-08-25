import { EventEmitter } from "node:events";
import path from "node:path";
import { PlaywrightAdapter } from "../browser/playwright-adapter.js";
import { Explorer } from "../explorer/index.js";
import {
  DEFAULT_BOUNDARIES,
  DEFAULT_TEST_DATA,
  type ExploreOptions,
} from "../models/index.js";
import { createSessionId, deriveApplicationName, SessionStore } from "./store.js";
import type {
  CreateSessionInput,
  ExplorationEvent,
  ExplorationEventPayload,
  ExplorationSession,
  SessionStatistics,
} from "./types.js";
import { CONTEXT_DOCUMENTS } from "./types.js";

interface ActiveRun {
  abortRequested: boolean;
}

export class SessionManager {
  private readonly store: SessionStore;
  private readonly bus = new EventEmitter();
  private readonly active = new Map<string, ActiveRun>();
  /** In-memory sessions — source of truth while the process is alive. */
  private readonly sessionCache = new Map<string, ExplorationSession>();
  /** In-memory events cache for live SSE (also persisted). */
  private readonly eventsCache = new Map<string, ExplorationEvent[]>();
  /** Serialize event handling + session patches per session. */
  private readonly eventQueues = new Map<string, Promise<void>>();
  private eventSeq = 0;

  constructor(private readonly dataRoot: string) {
    this.store = new SessionStore(path.join(dataRoot, "sessions"));
    this.bus.setMaxListeners(100);
  }

  getStore(): SessionStore {
    return this.store;
  }

  async listSessions(): Promise<ExplorationSession[]> {
    const fromDisk = await this.store.listSessions();
    for (const s of fromDisk) {
      if (!this.sessionCache.has(s.id)) this.sessionCache.set(s.id, s);
    }
    return [...this.sessionCache.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
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

  async startExploration(input: CreateSessionInput): Promise<ExplorationSession> {
    const url = normalizeUrl(input.applicationUrl);
    if (!url) {
      throw new Error("A valid application URL is required (include http:// or https://)");
    }

    const id = createSessionId();
    await this.store.ensureSession(id);

    const session: ExplorationSession = {
      id,
      applicationName: deriveApplicationName(url),
      applicationUrl: url,
      username: input.username?.trim() || undefined,
      status: "created",
      createdAt: new Date().toISOString(),
      statistics: { pages: 0, elements: 0, actions: 0, flows: 0 },
      contextPath: this.store.contextDir(id),
      memoryPath: this.store.memoryDir(id),
    };

    this.sessionCache.set(id, session);
    await this.store.saveSession(session);
    this.eventsCache.set(id, []);
    await this.store.saveEvents(id, []);
    this.publishSession(session);

    // Password stays in-process only — never written to session.json
    void this.runExploration(session.id, {
      url,
      username: input.username,
      password: input.password,
      headless: input.headless !== false,
      maxPages: input.maxPages,
      maxDepth: input.maxDepth,
      maxDurationMs: input.maxDurationMs,
    }).catch((err) => {
      console.error(`[session ${id}] exploration runner failed:`, err);
    });

    return session;
  }

  async retrySession(sessionId: string, password?: string): Promise<ExplorationSession> {
    const existing = await this.getSession(sessionId);
    if (!existing) throw new Error("Session not found");
    if (this.active.has(sessionId)) throw new Error("Session is already running");

    return this.startExploration({
      applicationUrl: existing.applicationUrl,
      username: existing.username,
      password,
      headless: true,
    });
  }

  private async runExploration(
    sessionId: string,
    creds: {
      url: string;
      username?: string;
      password?: string;
      headless: boolean;
      maxPages?: number;
      maxDepth?: number;
      maxDurationMs?: number;
    },
  ): Promise<void> {
    this.active.set(sessionId, { abortRequested: false });

    let session = await this.requireSession(sessionId);
    session = await this.updateSession(session.id, {
      status: "initializing",
      startedAt: new Date().toISOString(),
      error: undefined,
      completedAt: undefined,
    });

    const options: ExploreOptions = {
      url: creds.url,
      output: this.store.contextDir(sessionId),
      memoryDir: this.store.memoryDir(sessionId),
      username: creds.username,
      password: creds.password,
      headless: creds.headless,
      json: true,
      verbose: false,
      boundaries: {
        ...DEFAULT_BOUNDARIES,
        maxPages: creds.maxPages ?? DEFAULT_BOUNDARIES.maxPages,
        maxDepth: creds.maxDepth ?? DEFAULT_BOUNDARIES.maxDepth,
        maxDurationMs: creds.maxDurationMs ?? DEFAULT_BOUNDARIES.maxDurationMs,
      },
      testData: { ...DEFAULT_TEST_DATA },
    };

    const explorer = new Explorer(options, new PlaywrightAdapter(), (payload) => {
      this.enqueueEvent(sessionId, payload);
    });

    try {
      await this.updateSession(sessionId, { status: "exploring" });
      const result = await explorer.run(false);
      // Wait for queued event handlers (incl. exploration_completed) before final status write
      await this.flushEventQueue(sessionId);

      const events = this.eventsCache.get(sessionId) ?? [];
      await this.updateSession(sessionId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        error: undefined,
        statistics: {
          pages: result.exploration.pagesDiscovered,
          elements: result.exploration.elementsDiscovered,
          actions: events.filter((e) => e.type === "action_completed").length,
          flows: result.exploration.flowsDiscovered,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.flushEventQueue(sessionId).catch(() => undefined);
      await this.updateSession(sessionId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error: message,
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
    // Persist via store write queue (atomic); don't block the event chain on disk
    void this.store.saveEvents(sessionId, [...list]).catch(() => undefined);

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
      patch.status = "initializing";
    } else if (payload.type === "browser_initialized" && payload.status === "success") {
      patch.status = "exploring";
    } else if (payload.type === "exploration_completed") {
      // Final completed write is owned by runExploration after flush;
      // still refresh stats here for the live UI.
      if (payload.statistics) {
        patch.statistics = mergeStats(
          this.sessionCache.get(sessionId)?.statistics ?? session.statistics,
          payload.statistics,
        );
      }
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

  private async updateSession(
    sessionId: string,
    patch: Partial<ExplorationSession>,
  ): Promise<ExplorationSession> {
    const current = await this.requireSession(sessionId);
    const next: ExplorationSession = {
      ...current,
      ...patch,
      id: current.id,
      statistics: patch.statistics
        ? { ...current.statistics, ...patch.statistics }
        : current.statistics,
    };
    // Clear optional fields when explicitly set to undefined
    if ("error" in patch && patch.error === undefined) delete next.error;
    if ("completedAt" in patch && patch.completedAt === undefined) delete next.completedAt;

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
      available: boolean;
    }>
  > {
    const docs = [];
    for (const doc of CONTEXT_DOCUMENTS) {
      docs.push({
        ...doc,
        available: await this.store.documentExists(sessionId, doc.name),
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

function mergeStats(
  current: SessionStatistics,
  patch: Partial<SessionStatistics>,
): SessionStatistics {
  return {
    pages: patch.pages ?? current.pages,
    elements: patch.elements ?? current.elements,
    actions: patch.actions ?? current.actions,
    flows: patch.flows ?? current.flows,
  };
}
