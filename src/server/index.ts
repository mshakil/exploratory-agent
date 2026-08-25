import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SessionManager } from "../sessions/index.js";
import type { ExplorationEvent, ExplorationSession } from "../sessions/types.js";
import { createZipBuffer } from "./zip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveUiRoot(): string {
  // dist/server → ../../ui  |  src/server (tsx) → ../../ui
  return path.resolve(__dirname, "../../ui");
}

export interface ServeOptions {
  port?: number;
  host?: string;
  dataDir?: string;
}

export async function startUiServer(opts: ServeOptions = {}): Promise<{
  port: number;
  host: string;
  close: () => Promise<void>;
}> {
  const port = opts.port ?? 3847;
  const host = opts.host ?? "127.0.0.1";
  const dataDir = path.resolve(opts.dataDir ?? "./data");
  const uiRoot = resolveUiRoot();
  const manager = new SessionManager(dataDir);

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, manager, uiRoot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        json(res, 500, { error: message });
      } else {
        res.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on("error", reject);
  });

  return {
    port,
    host,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  manager: SessionManager,
  uiRoot: string,
): Promise<void> {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API ---
  if (pathname === "/api/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/sessions" && method === "GET") {
    const sessions = await manager.listSessions();
    json(res, 200, { sessions });
    return;
  }

  if (pathname === "/api/sessions" && method === "POST") {
    const body = await readJsonBody<{
      url?: string;
      username?: string;
      password?: string;
      headless?: boolean;
      maxPages?: number;
      maxDepth?: number;
      maxDurationMs?: number;
    }>(req);

    if (!body.url || typeof body.url !== "string") {
      json(res, 400, { error: "url is required" });
      return;
    }

    try {
      const session = await manager.startExploration({
        applicationUrl: body.url,
        username: body.username,
        password: body.password,
        headless: body.headless !== false,
        maxPages: body.maxPages,
        maxDepth: body.maxDepth,
        maxDurationMs: body.maxDurationMs,
      });
      json(res, 201, { session });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)(.*)$/);
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1]!);
    const rest = sessionMatch[2] || "";

    if (rest === "" && method === "GET") {
      const session = await manager.getSession(sessionId);
      if (!session) {
        json(res, 404, { error: "Session not found" });
        return;
      }
      json(res, 200, { session });
      return;
    }

    if (rest === "/events" && method === "GET") {
      const events = await manager.getEvents(sessionId);
      json(res, 200, { events });
      return;
    }

    if (rest === "/events/stream" && method === "GET") {
      await streamSessionEvents(req, res, manager, sessionId);
      return;
    }

    if (rest === "/documents" && method === "GET") {
      const session = await manager.getSession(sessionId);
      if (!session) {
        json(res, 404, { error: "Session not found" });
        return;
      }
      const documents = await manager.listDocuments(sessionId);
      json(res, 200, { documents });
      return;
    }

    if (rest === "/documents/download-all" && method === "GET") {
      const session = await manager.getSession(sessionId);
      if (!session) {
        json(res, 404, { error: "Session not found" });
        return;
      }
      const documents = await manager.listDocuments(sessionId);
      const entries = [];
      for (const doc of documents) {
        if (!doc.available) continue;
        const content = await manager.getStore().readDocument(sessionId, doc.name);
        if (content !== null) entries.push({ name: doc.name, content });
      }
      if (entries.length === 0) {
        json(res, 404, { error: "No documents available to download" });
        return;
      }
      const zip = createZipBuffer(entries);
      const zipName = `${sanitizeFilename(session.applicationName)}-context.zip`;
      cors(res);
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Length": zip.length,
        "Content-Disposition": `attachment; filename="${zipName}"`,
      });
      res.end(zip);
      return;
    }

    const docMatch = rest.match(/^\/documents\/([^/]+)$/);
    if (docMatch && method === "GET") {
      const name = decodeURIComponent(docMatch[1]!);
      if (name.includes("..") || name.includes("/") || name.includes("\\")) {
        json(res, 400, { error: "Invalid document name" });
        return;
      }
      const content = await manager.getStore().readDocument(sessionId, name);
      if (content === null) {
        json(res, 404, { error: "Document not found" });
        return;
      }
      const download = url.searchParams.get("download") === "1";
      const contentType = name.endsWith(".json")
        ? "application/json; charset=utf-8"
        : "text/markdown; charset=utf-8";
      cors(res);
      res.writeHead(200, {
        "Content-Type": contentType,
        ...(download
          ? { "Content-Disposition": `attachment; filename="${name}"` }
          : {}),
      });
      res.end(content);
      return;
    }

    if (rest === "/retry" && method === "POST") {
      const body = await readJsonBody<{ password?: string }>(req);
      try {
        const session = await manager.retrySession(sessionId, body.password);
        json(res, 201, { session });
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (rest === "/context" && method === "DELETE") {
      try {
        const result = await manager.removeContext(sessionId);
        json(res, 200, result);
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (rest === "" && method === "DELETE") {
      try {
        await manager.deleteSession(sessionId);
        json(res, 200, { deleted: true, id: sessionId });
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
  }

  // --- Static UI ---
  if (method === "GET") {
    await serveStatic(res, uiRoot, pathname);
    return;
  }

  json(res, 405, { error: "Method not allowed" });
}

async function streamSessionEvents(
  req: IncomingMessage,
  res: ServerResponse,
  manager: SessionManager,
  sessionId: string,
): Promise<void> {
  const session = await manager.getSession(sessionId);
  if (!session) {
    json(res, 404, { error: "Session not found" });
    return;
  }

  cors(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`: connected\n\n`);

  const send = (eventName: string, data: unknown) => {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Replay history then live updates
  const history = await manager.getEvents(sessionId);
  send("snapshot", { session, events: history });

  const offEvent = manager.onSessionEvent(sessionId, (event: ExplorationEvent) => {
    send("event", event);
  });
  const offSession = manager.onSessionUpdated((s: ExplorationSession) => {
    if (s.id === sessionId) send("session", s);
  });

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    offEvent();
    offSession();
  };

  req.on("close", cleanup);
  req.on("aborted", cleanup);
}

async function serveStatic(
  res: ServerResponse,
  uiRoot: string,
  pathname: string,
): Promise<void> {
  let rel = pathname === "/" ? "/index.html" : pathname;
  if (rel.includes("..")) {
    json(res, 400, { error: "Invalid path" });
    return;
  }

  const filePath = path.join(uiRoot, rel);
  if (!filePath.startsWith(uiRoot)) {
    json(res, 400, { error: "Invalid path" });
    return;
  }

  try {
    const content = await readFile(filePath);
    cors(res);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch {
    // SPA fallback
    try {
      const index = await readFile(path.join(uiRoot, "index.html"));
      cors(res);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(index);
    } catch {
      json(res, 404, { error: "UI assets not found. Ensure the ui/ folder exists." });
    }
  }
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  cors(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {} as T;
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "application-context";
}
