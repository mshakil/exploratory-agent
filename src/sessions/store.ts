import { access, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { getDb } from "../db/client.js";
import {
  explorationEvents,
  explorationRuns,
  explorationSessions,
  type EventRow,
  type RunRow,
  type SessionRow,
} from "../db/schema.js";
import {
  ExplorationEventSchema,
  ExplorationRunSchema,
  ExplorationSessionSchema,
  type ExplorationEvent,
  type ExplorationRun,
  type ExplorationSession,
  type ListSessionsFilter,
  type RunStatistics,
} from "./types.js";

function contextRelpath(sessionId: string): string {
  return path.posix.join("sessions", sessionId, "application-context");
}

function memoryRelpath(sessionId: string): string {
  return path.posix.join("sessions", sessionId, "memory");
}

function toIso(value: string | Date | null | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function sessionFromRow(row: SessionRow, dataRoot: string): ExplorationSession {
  const statistics = {
    pages: row.statsPages,
    elements: row.statsElements,
    actions: row.statsActions,
    flows: row.statsFlows,
    skipped: row.statsSkipped,
  };
  const latestChanges = row.latestChanges
    ? (row.latestChanges as RunStatistics)
    : undefined;

  const raw = {
    id: row.id,
    applicationName: row.applicationName,
    applicationUrl: row.applicationUrl,
    username: row.targetUsername ?? undefined,
    framework: row.framework,
    status: row.status,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    error: row.error ?? undefined,
    currentExplorationId: row.currentExplorationId ?? undefined,
    statistics,
    contextPath: path.join(dataRoot, row.contextRelpath),
    memoryPath: path.join(dataRoot, row.memoryRelpath),
    ownerUserId: row.ownerUserId,
    latestChanges,
    stabilityProfile: row.stabilityProfile ?? undefined,
    authMode: row.authMode ?? undefined,
    domainAllowlist: row.domainAllowlist ?? undefined,
    exploreOpenShadow: row.exploreOpenShadow ?? undefined,
    exploreSameOriginFrames: row.exploreSameOriginFrames ?? undefined,
    dismissConsent: row.dismissConsent ?? undefined,
  };

  return ExplorationSessionSchema.parse(raw);
}

function runFromRow(row: RunRow): ExplorationRun {
  return ExplorationRunSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    type: row.type,
    startedAt: toIso(row.startedAt)!,
    completedAt: toIso(row.completedAt),
    status: row.status,
    statistics: row.statistics ?? {},
    changeReportPath: row.changeReportRelpath ?? undefined,
  });
}

function eventFromRow(row: EventRow): ExplorationEvent {
  return ExplorationEventSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    timestamp: toIso(row.ts)!,
    type: row.type,
    title: row.title,
    description: row.description ?? undefined,
    metadata: row.metadata ?? undefined,
    status: row.status,
  });
}

export class SessionStore {
  private readonly db: Db;

  constructor(
    private readonly dataRoot: string,
    db?: Db,
  ) {
    this.db = db ?? getDb();
  }

  get rootDir(): string {
    return path.join(this.dataRoot, "sessions");
  }

  sessionDir(sessionId: string): string {
    return path.join(this.rootDir, sessionId);
  }

  contextDir(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "application-context");
  }

  memoryDir(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "memory");
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  async ensureSession(sessionId: string): Promise<void> {
    await mkdir(this.sessionDir(sessionId), { recursive: true });
    await mkdir(this.contextDir(sessionId), { recursive: true });
    await mkdir(this.memoryDir(sessionId), { recursive: true });
  }

  async saveSession(session: ExplorationSession): Promise<void> {
    if (!session.ownerUserId?.trim()) {
      throw new Error("ownerUserId is required to persist a session");
    }
    await this.ensureSession(session.id);
    const parsed = ExplorationSessionSchema.parse(session);

    const values = {
      id: parsed.id,
      ownerUserId: parsed.ownerUserId!,
      applicationName: parsed.applicationName,
      applicationUrl: parsed.applicationUrl,
      targetUsername: parsed.username ?? null,
      framework: parsed.framework,
      status: parsed.status,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      startedAt: parsed.startedAt ?? null,
      completedAt: parsed.completedAt ?? null,
      error: parsed.error ?? null,
      currentExplorationId: parsed.currentExplorationId ?? null,
      statsPages: parsed.statistics.pages,
      statsElements: parsed.statistics.elements,
      statsActions: parsed.statistics.actions,
      statsFlows: parsed.statistics.flows,
      statsSkipped: parsed.statistics.skipped ?? 0,
      contextRelpath: contextRelpath(parsed.id),
      memoryRelpath: memoryRelpath(parsed.id),
      stabilityProfile: parsed.stabilityProfile ?? null,
      authMode: parsed.authMode ?? null,
      domainAllowlist: parsed.domainAllowlist ?? [],
      exploreOpenShadow: parsed.exploreOpenShadow ?? null,
      exploreSameOriginFrames: parsed.exploreSameOriginFrames ?? null,
      dismissConsent: parsed.dismissConsent ?? null,
      latestChanges: parsed.latestChanges ?? null,
    };

    await this.db
      .insert(explorationSessions)
      .values(values)
      .onConflictDoUpdate({
        target: explorationSessions.id,
        set: {
          ownerUserId: values.ownerUserId,
          applicationName: values.applicationName,
          applicationUrl: values.applicationUrl,
          targetUsername: values.targetUsername,
          framework: values.framework,
          status: values.status,
          updatedAt: values.updatedAt,
          startedAt: values.startedAt,
          completedAt: values.completedAt,
          error: values.error,
          currentExplorationId: values.currentExplorationId,
          statsPages: values.statsPages,
          statsElements: values.statsElements,
          statsActions: values.statsActions,
          statsFlows: values.statsFlows,
          statsSkipped: values.statsSkipped,
          contextRelpath: values.contextRelpath,
          memoryRelpath: values.memoryRelpath,
          stabilityProfile: values.stabilityProfile,
          authMode: values.authMode,
          domainAllowlist: values.domainAllowlist,
          exploreOpenShadow: values.exploreOpenShadow,
          exploreSameOriginFrames: values.exploreSameOriginFrames,
          dismissConsent: values.dismissConsent,
          latestChanges: values.latestChanges,
        },
      });
  }

  async loadSession(sessionId: string): Promise<ExplorationSession | null> {
    const rows = await this.db
      .select()
      .from(explorationSessions)
      .where(eq(explorationSessions.id, sessionId))
      .limit(1);
    if (!rows[0]) return null;
    return sessionFromRow(rows[0], this.dataRoot);
  }

  async listSessions(filter?: ListSessionsFilter): Promise<ExplorationSession[]> {
    await this.ensureRoot();
    let rows: SessionRow[];
    if (filter?.admin) {
      rows = await this.db
        .select()
        .from(explorationSessions)
        .orderBy(desc(explorationSessions.updatedAt));
    } else if (filter?.ownerUserId) {
      rows = await this.db
        .select()
        .from(explorationSessions)
        .where(eq(explorationSessions.ownerUserId, filter.ownerUserId))
        .orderBy(desc(explorationSessions.updatedAt));
    } else {
      rows = await this.db
        .select()
        .from(explorationSessions)
        .orderBy(desc(explorationSessions.updatedAt));
    }
    return rows.map((r) => sessionFromRow(r, this.dataRoot));
  }

  async saveRun(run: ExplorationRun): Promise<void> {
    await this.ensureSession(run.sessionId);
    const parsed = ExplorationRunSchema.parse(run);
    const values = {
      id: parsed.id,
      sessionId: parsed.sessionId,
      type: parsed.type,
      startedAt: parsed.startedAt,
      completedAt: parsed.completedAt ?? null,
      status: parsed.status,
      statistics: parsed.statistics as Record<string, number>,
      changeReportRelpath: parsed.changeReportPath ?? null,
    };
    await this.db
      .insert(explorationRuns)
      .values(values)
      .onConflictDoUpdate({
        target: [explorationRuns.sessionId, explorationRuns.id],
        set: {
          type: values.type,
          startedAt: values.startedAt,
          completedAt: values.completedAt,
          status: values.status,
          statistics: values.statistics,
          changeReportRelpath: values.changeReportRelpath,
        },
      });
  }

  async loadRun(sessionId: string, runId: string): Promise<ExplorationRun | null> {
    const rows = await this.db
      .select()
      .from(explorationRuns)
      .where(
        and(eq(explorationRuns.sessionId, sessionId), eq(explorationRuns.id, runId)),
      )
      .limit(1);
    return rows[0] ? runFromRow(rows[0]) : null;
  }

  async listRuns(sessionId: string): Promise<ExplorationRun[]> {
    await this.ensureSession(sessionId);
    const rows = await this.db
      .select()
      .from(explorationRuns)
      .where(eq(explorationRuns.sessionId, sessionId))
      .orderBy(asc(explorationRuns.startedAt));
    return rows.map(runFromRow);
  }

  async nextRunId(sessionId: string): Promise<string> {
    const runs = await this.listRuns(sessionId);
    const n = runs.length + 1;
    return `exploration-${String(n).padStart(3, "0")}`;
  }

  async loadGraph(sessionId: string): Promise<{
    pages: Array<Record<string, unknown>>;
    transitions: Array<Record<string, unknown>>;
  }> {
    const dir = this.memoryDir(sessionId);
    const readArr = async (filePath: string) => {
      try {
        const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
        return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
      } catch {
        return [];
      }
    };

    let pages = await readArr(path.join(dir, "pages.json"));
    let transitions = await readArr(path.join(dir, "transitions.json"));

    if (pages.length === 0) {
      try {
        const text = await readFile(
          path.join(this.contextDir(sessionId), "application.json"),
          "utf8",
        );
        const ctx = JSON.parse(text) as {
          pages?: Array<Record<string, unknown>>;
          transitions?: Array<Record<string, unknown>>;
        };
        if (Array.isArray(ctx.pages)) pages = ctx.pages;
        if (Array.isArray(ctx.transitions)) transitions = ctx.transitions;
      } catch {
        // keep empty
      }
    }

    return { pages, transitions };
  }

  async appendEvent(sessionId: string, event: ExplorationEvent): Promise<void> {
    const parsed = ExplorationEventSchema.parse(event);
    await this.db.insert(explorationEvents).values({
      id: parsed.id,
      sessionId,
      ts: parsed.timestamp,
      type: parsed.type,
      title: parsed.title,
      description: parsed.description ?? null,
      metadata: (parsed.metadata as Record<string, unknown> | undefined) ?? null,
      status: parsed.status,
    });
  }

  async loadEvents(sessionId: string): Promise<ExplorationEvent[]> {
    const rows = await this.db
      .select()
      .from(explorationEvents)
      .where(eq(explorationEvents.sessionId, sessionId))
      .orderBy(asc(explorationEvents.seq));
    return rows.map(eventFromRow);
  }

  async clearEvents(sessionId: string): Promise<void> {
    await this.db
      .delete(explorationEvents)
      .where(eq(explorationEvents.sessionId, sessionId));
  }

  /** @deprecated Prefer appendEvent; kept for tests that seed a full list. */
  async saveEvents(sessionId: string, events: ExplorationEvent[]): Promise<void> {
    await this.clearEvents(sessionId);
    for (const event of events) {
      await this.appendEvent(sessionId, event);
    }
  }

  async documentExists(sessionId: string, name: string): Promise<boolean> {
    try {
      await access(path.join(this.contextDir(sessionId), name));
      return true;
    } catch {
      try {
        await access(path.join(this.contextDir(sessionId), ...name.split("/")));
        return true;
      } catch {
        return false;
      }
    }
  }

  async readDocument(sessionId: string, name: string): Promise<string | null> {
    try {
      return await readFile(path.join(this.contextDir(sessionId), ...name.split("/")), "utf8");
    } catch {
      return null;
    }
  }

  async documentSize(sessionId: string, name: string): Promise<number | null> {
    try {
      const s = await stat(path.join(this.contextDir(sessionId), ...name.split("/")));
      return s.size;
    } catch {
      return null;
    }
  }

  async listChangeReports(sessionId: string): Promise<string[]> {
    const dir = path.join(this.contextDir(sessionId), "changes");
    try {
      const entries = await readdir(dir);
      return entries.filter((e) => e.endsWith(".md")).sort().map((e) => `changes/${e}`);
    } catch {
      return [];
    }
  }

  async listFrameworkDocs(sessionId: string): Promise<string[]> {
    const dir = path.join(this.contextDir(sessionId), "framework");
    try {
      const entries = await readdir(dir);
      return entries.filter((e) => e.endsWith(".md")).map((e) => `framework/${e}`);
    } catch {
      return [];
    }
  }

  documentPath(sessionId: string, name: string): string {
    return path.join(this.contextDir(sessionId), ...name.split("/"));
  }

  async clearContext(sessionId: string): Promise<number> {
    const dir = this.contextDir(sessionId);
    let removed = 0;
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      await mkdir(dir, { recursive: true });
      return 0;
    }
    for (const entry of entries) {
      await rm(path.join(dir, entry), { recursive: true, force: true });
      removed += 1;
    }
    await mkdir(dir, { recursive: true });
    return removed;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db
      .delete(explorationSessions)
      .where(eq(explorationSessions.id, sessionId));
    await rm(this.sessionDir(sessionId), { recursive: true, force: true });
  }
}

export function createSessionId(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `session-${stamp}-${rand}`;
}

export function deriveApplicationName(url: string, pageTitle?: string): string {
  const cleanedTitle = pageTitle?.trim();
  if (cleanedTitle && cleanedTitle.length > 0 && cleanedTitle.toLowerCase() !== "untitled") {
    const primary = cleanedTitle.split(/\s*[|\-–—]\s*/)[0]?.trim();
    if (primary && primary.length >= 2) return primary;
    return cleanedTitle;
  }

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const labels = host.split(".").filter(Boolean);
    if (labels.length >= 3) {
      const sub = labels[0]!;
      if (!/^(app|www|web|portal|login|auth|demo|opensource-demo)$/i.test(sub)) {
        return formatHostLabel(sub);
      }
    }
    const domain = labels.length >= 2 ? labels[labels.length - 2]! : labels[0] || host;
    return formatHostLabel(domain);
  } catch {
    return "Application";
  }
}

function formatHostLabel(raw: string): string {
  const words = raw
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const name = words.join(" ");
  if (!name) return "Application";
  if (/application|app|portal|system/i.test(name)) return name;
  return `${name} Application`;
}
