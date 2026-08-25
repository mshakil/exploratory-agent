import { access, mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ExplorationEventSchema,
  ExplorationSessionSchema,
  type ExplorationEvent,
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

  private sessionFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "session.json");
  }

  private eventsFile(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "events.json");
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
    await this.ensureSession(session.id);
    const parsed = ExplorationSessionSchema.parse(session);
    await this.writeJsonAtomic(this.sessionFile(session.id), parsed);
  }

  async loadSession(sessionId: string): Promise<ExplorationSession | null> {
    try {
      const text = await readFile(this.sessionFile(sessionId), "utf8");
      const raw = JSON.parse(text);
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
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
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
      return false;
    }
  }

  async readDocument(sessionId: string, name: string): Promise<string | null> {
    try {
      return await readFile(path.join(this.contextDir(sessionId), name), "utf8");
    } catch {
      return null;
    }
  }

  documentPath(sessionId: string, name: string): string {
    return path.join(this.contextDir(sessionId), name);
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
          // Windows cannot rename over an existing file
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
    // Strip common suffixes like " | Login" or " - Sign in"
    const primary = cleanedTitle.split(/\s*[|\-–—]\s*/)[0]?.trim();
    if (primary && primary.length >= 2) return primary;
    return cleanedTitle;
  }

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const labels = host.split(".").filter(Boolean);
    // Prefer subdomain when it looks product-like (crm.company.com → CRM)
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
