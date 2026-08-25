import { access, mkdir, readdir, readFile, rename, rm, unlink, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  ExplorationEventSchema,
  ExplorationRunSchema,
  ExplorationSessionSchema,
  type ExplorationEvent,
  type ExplorationRun,
  type ExplorationSession,
} from "./types.js";

export class SessionStore {
  /** Serialize writes per file path to avoid interleaved JSON corruption. */
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(private readonly rootDir: string) {}

  sessionDir(sessionId: string): string {
    return path.join(this.rootDir, sessionId);
  }

  contextDir(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "application-context");
  }

  memoryDir(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "memory");
  }

  runsDir(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "exploration-runs");
  }

  private sessionFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "session.json");
  }

  private eventsFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "events.json");
  }

  private runFile(sessionId: string, runId: string): string {
    return path.join(this.runsDir(sessionId), `${runId}.json`);
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  async ensureSession(sessionId: string): Promise<void> {
    await mkdir(this.sessionDir(sessionId), { recursive: true });
    await mkdir(this.contextDir(sessionId), { recursive: true });
    await mkdir(this.memoryDir(sessionId), { recursive: true });
    await mkdir(this.runsDir(sessionId), { recursive: true });
  }

  async saveSession(session: ExplorationSession): Promise<void> {
    await this.ensureSession(session.id);
    const parsed = ExplorationSessionSchema.parse(session);
    await this.writeJsonAtomic(this.sessionFile(session.id), parsed);
  }

  async loadSession(sessionId: string): Promise<ExplorationSession | null> {
    try {
      const text = await readFile(this.sessionFile(sessionId), "utf8");
      const raw = JSON.parse(text) as Record<string, unknown>;
      // Backward compat: older sessions lack updatedAt / framework
      if (!raw.updatedAt) raw.updatedAt = (raw.completedAt as string) || (raw.createdAt as string);
      if (!raw.framework) raw.framework = "independent";
      return ExplorationSessionSchema.parse(raw);
    } catch {
      return null;
    }
  }

  async listSessions(): Promise<ExplorationSession[]> {
    await this.ensureRoot();
    let entries: string[];
    try {
      entries = await readdir(this.rootDir);
    } catch {
      return [];
    }

    const sessions: ExplorationSession[] = [];
    for (const entry of entries) {
      const session = await this.loadSession(entry);
      if (session) sessions.push(session);
    }

    return sessions.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime(),
    );
  }

  async saveRun(run: ExplorationRun): Promise<void> {
    await this.ensureSession(run.sessionId);
    const parsed = ExplorationRunSchema.parse(run);
    await this.writeJsonAtomic(this.runFile(run.sessionId, run.id), parsed);
  }

  async loadRun(sessionId: string, runId: string): Promise<ExplorationRun | null> {
    try {
      const text = await readFile(this.runFile(sessionId, runId), "utf8");
      return ExplorationRunSchema.parse(JSON.parse(text));
    } catch {
      return null;
    }
  }

  async listRuns(sessionId: string): Promise<ExplorationRun[]> {
    await this.ensureSession(sessionId);
    let entries: string[];
    try {
      entries = await readdir(this.runsDir(sessionId));
    } catch {
      return [];
    }
    const runs: ExplorationRun[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const run = await this.loadRun(sessionId, entry.replace(/\.json$/, ""));
      if (run) runs.push(run);
    }
    return runs.sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
  }

  async nextRunId(sessionId: string): Promise<string> {
    const runs = await this.listRuns(sessionId);
    const n = runs.length + 1;
    return `exploration-${String(n).padStart(3, "0")}`;
  }

  /** Load application graph (pages + transitions) from session memory. */
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

    // Fallback for sessions that only have application-context written
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

  async saveEvents(sessionId: string, events: ExplorationEvent[]): Promise<void> {
    await this.ensureSession(sessionId);
    const parsed = events.map((e) => ExplorationEventSchema.parse(e));
    await this.writeJsonAtomic(this.eventsFile(sessionId), parsed);
  }

  async loadEvents(sessionId: string): Promise<ExplorationEvent[]> {
    try {
      const raw = JSON.parse(await readFile(this.eventsFile(sessionId), "utf8")) as unknown[];
      return raw.map((e) => ExplorationEventSchema.parse(e));
    } catch {
      return [];
    }
  }

  async appendEvent(sessionId: string, event: ExplorationEvent): Promise<ExplorationEvent[]> {
    const events = await this.loadEvents(sessionId);
    events.push(ExplorationEventSchema.parse(event));
    await this.saveEvents(sessionId, events);
    return events;
  }

  async documentExists(sessionId: string, name: string): Promise<boolean> {
    try {
      await access(path.join(this.contextDir(sessionId), name));
      return true;
    } catch {
      // Also check nested paths like framework/playwright.md
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

  /** List change report files under application-context/changes/. */
  async listChangeReports(sessionId: string): Promise<string[]> {
    const dir = path.join(this.contextDir(sessionId), "changes");
    try {
      const entries = await readdir(dir);
      return entries.filter((e) => e.endsWith(".md")).sort().map((e) => `changes/${e}`);
    } catch {
      return [];
    }
  }

  /** List framework docs under application-context/framework/. */
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

  /** Delete generated application-context documents for a session. */
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

  /** Permanently delete a session directory and all of its data. */
  async deleteSession(sessionId: string): Promise<void> {
    await rm(this.sessionDir(sessionId), { recursive: true, force: true });
  }

  /** Queue + temp-file rename so concurrent writers cannot interleave JSON. */
  private writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const prev = this.writeQueues.get(filePath) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        const payload = JSON.stringify(data, null, 2);
        await writeFile(tmp, payload, "utf8");
        try {
          await rename(tmp, filePath);
        } catch {
          await unlink(filePath).catch(() => undefined);
          await rename(tmp, filePath);
        }
      });
    this.writeQueues.set(filePath, next);
    return next;
  }
}

export function createSessionId(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `session-${stamp}-${rand}`;
}

/** Derive a human-readable application name from a URL (and optional page title). */
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
