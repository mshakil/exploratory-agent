import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../db/load-env.js";
import { ensurePlaywrightBrowsersPath } from "../browser/ensure-browsers-path.js";
import { closeDb, migrate, requireDatabaseUrl } from "../db/index.js";
import { AuthService, toPublicUser, type User } from "../auth/index.js";
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
  await loadEnvFile();
  ensurePlaywrightBrowsersPath();
  requireDatabaseUrl();
  await migrate();

  const port = opts.port ?? 3847;
  const host = opts.host ?? "127.0.0.1";
  const dataDir = path.resolve(
    opts.dataDir ?? process.env.AE_DATA_DIR ?? "./data",
  );
  const uiRoot = resolveUiRoot();
  const manager = new SessionManager(dataDir);
  const auth = new AuthService();
  await auth.init();

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, manager, auth, uiRoot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        json(req, res, 500, { error: message });
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
        server.close(async (err) => {
          await closeDb().catch(() => undefined);
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  manager: SessionManager,
  auth: AuthService,
  uiRoot: string,
): Promise<void> {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (method === "OPTIONS") {
    cors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  // --- Public API ---
  if (pathname === "/api/health") {
    json(req, res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/auth/providers" && method === "GET") {
    json(req, res, 200, { providers: auth.listProviders() });
    return;
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    const me = await auth.me(req);
    if (!me) {
      json(req, res, 401, { error: "Not authenticated" });
      return;
    }
    json(req, res, 200, { user: me });
    return;
  }

  if (pathname === "/api/auth/register" && method === "POST") {
    const body = await readJsonBody<{ username?: string; password?: string }>(req);
    try {
      if (!body.username || !body.password) {
        json(req, res, 400, { error: "username and password are required" });
        return;
      }
      const user = await auth.register(body.username, body.password);
      setAuthCookie(req, res, auth, user.id);
      json(req, res, 201, { user: toPublicUser(user) });
    } catch (err) {
      json(req, res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await readJsonBody<{ username?: string; password?: string }>(req);
    try {
      if (!body.username || !body.password) {
        json(req, res, 400, { error: "username and password are required" });
        return;
      }
      const user = await auth.login(body.username, body.password);
      setAuthCookie(req, res, auth, user.id);
      json(req, res, 200, { user: toPublicUser(user) });
    } catch (err) {
      json(req, res, 401, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    res.setHeader("Set-Cookie", auth.clearCookie(isSecureRequest(req)));
    json(req, res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/auth/azure/start" && method === "GET") {
    if (!auth.azure.isConfigured()) {
      json(req, res, 501, {
        error: "Azure AD is not configured. Set AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AE_PUBLIC_BASE_URL.",
      });
      return;
    }
    try {
      auth.azure.getAuthorizeUrl("pending");
      json(req, res, 501, { error: "Azure AD sign-in is not implemented yet" });
    } catch (err) {
      json(req, res, 501, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (pathname === "/api/auth/azure/callback" && method === "GET") {
    json(req, res, 501, { error: "Azure AD sign-in is not implemented yet" });
    return;
  }

  // --- AI BYOK API (authenticated; keys never persisted) ---
  if (pathname === "/api/ai/providers" && method === "GET") {
    const user = await auth.requireUser(req);
    if (!user) {
      json(req, res, 401, { error: "Not authenticated" });
      return;
    }
    const { AI_PROVIDERS } = await import("../ai/index.js");
    json(req, res, 200, { providers: AI_PROVIDERS });
    return;
  }

  if (pathname === "/api/ai/models" && method === "POST") {
    const user = await auth.requireUser(req);
    if (!user) {
      json(req, res, 401, { error: "Not authenticated" });
      return;
    }
    const apiKey = String(req.headers["x-api-key"] || "").trim();
    const body = await readJsonBody<{
      provider?: string;
      azureEndpoint?: string;
      apiKey?: string;
    }>(req);
    const key = apiKey || String(body.apiKey || "").trim();
    if (!body.provider) {
      json(req, res, 400, { error: "provider is required" });
      return;
    }
    if (!key) {
      json(req, res, 400, { error: "API key required (x-api-key header)" });
      return;
    }
    try {
      const { listProviderModels } = await import("../ai/index.js");
      const models = await listProviderModels({
        provider: body.provider as "openai" | "anthropic" | "azure-openai",
        apiKey: key,
        azureEndpoint: body.azureEndpoint,
      });
      json(req, res, 200, { models });
    } catch (err) {
      json(req, res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (pathname === "/api/ai/generate-docs" && method === "POST") {
    const user = await auth.requireUser(req);
    if (!user) {
      json(req, res, 401, { error: "Not authenticated" });
      return;
    }
    const apiKeyHeader = String(req.headers["x-api-key"] || "").trim();
    const body = await readJsonBody<{
      sessionId?: string;
      provider?: string;
      model?: string;
      modules?: string[];
      azureEndpoint?: string;
      azureDeployment?: string;
      apiKey?: string;
      stream?: boolean;
    }>(req);
    const apiKey = apiKeyHeader || String(body.apiKey || "").trim();
    if (!body.sessionId) {
      json(req, res, 400, { error: "sessionId is required" });
      return;
    }
    if (!apiKey) {
      json(req, res, 400, { error: "API key required (x-api-key header)" });
      return;
    }
    if (!body.provider || !body.model) {
      json(req, res, 400, { error: "provider and model are required" });
      return;
    }

    const owned = await requireOwnedSession(req, res, manager, auth, user, body.sessionId);
    if (!owned) return;

    const stream = body.stream !== false;
    const writeEvent = stream ? ndjson(req, res) : null;

    try {
      const { ApplicationContextSchema } = await import("../models/index.js");
      const { generateAiDocumentation } = await import("../ai/index.js");
      const store = manager.getStore();
      const systemDir = store.contextDir(owned.id);
      const aiDir = store.aiContextDir(owned.id);
      const contextPath = path.join(systemDir, "application.json");
      const raw = await readFile(contextPath, "utf8");
      const context = ApplicationContextSchema.parse(JSON.parse(raw));
      const modules = (body.modules || ["docs"]).filter(
        (m): m is "docs" | "enrich" | "explore-hints" =>
          m === "docs" || m === "enrich" || m === "explore-hints",
      );
      const result = await generateAiDocumentation({
        context,
        systemDir,
        aiDir,
        meta: {
          framework: owned.framework,
          applicationName: owned.applicationName,
          applicationUrl: owned.applicationUrl,
          status: owned.status,
          statistics: owned.statistics,
          runs: await manager.listRuns(owned.id),
        },
        modules,
        chat: {
          provider: body.provider as "openai" | "anthropic" | "azure-openai",
          model: body.model,
          apiKey,
          azureEndpoint: body.azureEndpoint,
          azureDeployment: body.azureDeployment,
        },
        onProgress: writeEvent
          ? (progress) => writeEvent({ type: "progress", ...progress })
          : undefined,
      });

      if (result.error && result.fallbackToSystem) {
        const payload = {
          type: "error",
          error: result.error,
          fallbackToSystem: true,
          usage: result.usage,
        };
        if (writeEvent) {
          writeEvent(payload);
          res.end();
        } else {
          json(req, res, 502, {
            error: result.error,
            fallbackToSystem: true,
            usage: result.usage,
          });
        }
        return;
      }

      const historyEntry = {
        at: new Date().toISOString(),
        module: "docs",
        provider: result.usage.provider,
        model: result.usage.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCostUsd: result.usage.estimatedCostUsd,
      };
      const priorHistory = owned.aiUsageHistory ?? [];
      const session = await manager.updateSession(owned.id, {
        docGenerationMode: "ai",
        aiModules: modules,
        aiUsage: result.usage,
        aiUsageHistory: [...priorHistory, historyEntry],
      });

      const complete = {
        type: "complete",
        ok: true,
        files: result.files.map((f) => path.basename(f)),
        usage: result.usage,
        manifest: result.manifest,
        session,
      };
      if (writeEvent) {
        writeEvent(complete);
        res.end();
      } else {
        json(req, res, 200, complete);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (writeEvent) {
        writeEvent({ type: "error", error: message });
        res.end();
      } else {
        json(req, res, 400, { error: message });
      }
    }
    return;
  }

  // --- Protected session API ---
  if (pathname.startsWith("/api/sessions")) {
    const user = await auth.requireUser(req);
    if (!user) {
      json(req, res, 401, { error: "Not authenticated" });
      return;
    }

    if (pathname === "/api/sessions" && method === "GET") {
      const sessions = await manager.listSessions(
        user.role === "admin" ? { admin: true } : { ownerUserId: user.id },
      );
      json(req, res, 200, { sessions });
      return;
    }

    if (pathname === "/api/sessions" && method === "POST") {
      const body = await readJsonBody<{
        url?: string;
        username?: string;
        password?: string;
        framework?: string;
        headless?: boolean;
        maxPages?: number;
        maxDepth?: number;
        maxDurationMs?: number;
        stabilityProfile?: string;
        authMode?: string;
        storageState?: string;
        domainAllowlist?: string[];
        exploreOpenShadow?: boolean;
        exploreSameOriginFrames?: boolean;
        dismissConsent?: boolean;
        docGenerationMode?: "system" | "ai";
        aiModules?: Array<"docs" | "enrich" | "explore-hints">;
      }>(req);

      if (!body.url || typeof body.url !== "string") {
        json(req, res, 400, { error: "url is required" });
        return;
      }

      try {
        const session = await manager.startExploration({
          applicationUrl: body.url,
          ownerUserId: user.id,
          username: body.username,
          password: body.password,
          framework: body.framework as import("../sessions/types.js").Framework | undefined,
          headless: body.headless !== false,
          maxPages: body.maxPages,
          maxDepth: body.maxDepth,
          maxDurationMs: body.maxDurationMs,
          stabilityProfile: body.stabilityProfile as
            | "fast"
            | "balanced"
            | "deep"
            | undefined,
          authMode: body.authMode as
            | "none"
            | "credentials"
            | "storage-state"
            | "manual-wait"
            | undefined,
          storageState: body.storageState,
          domainAllowlist: body.domainAllowlist,
          exploreOpenShadow: body.exploreOpenShadow,
          exploreSameOriginFrames: body.exploreSameOriginFrames,
          dismissConsent: body.dismissConsent,
          docGenerationMode: body.docGenerationMode,
          aiModules: body.aiModules,
        });
        json(req, res, 201, { session });
      } catch (err) {
        json(req, res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)(.*)$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]!);
      const rest = sessionMatch[2] || "";

      const owned = await requireOwnedSession(req, res, manager, auth, user, sessionId);
      if (!owned) return;

      if (rest === "" && method === "GET") {
        json(req, res, 200, { session: owned });
        return;
      }

      if (rest === "/events" && method === "GET") {
        const events = await manager.getEvents(sessionId);
        json(req, res, 200, { events });
        return;
      }

      if (rest === "/events/stream" && method === "GET") {
        await streamSessionEvents(req, res, manager, sessionId, owned);
        return;
      }

      if (rest === "/documents" && method === "GET") {
        const variant = parseDocVariant(url.searchParams.get("variant"));
        const listing = await manager.listDocuments(sessionId, variant);
        json(req, res, 200, listing);
        return;
      }

      if (rest === "/documents/download-all" && method === "GET") {
        const variant = parseDocVariant(url.searchParams.get("variant"));
        const listing = await manager.listDocuments(sessionId, variant);
        const entries = [];
        for (const doc of listing.documents) {
          if (!doc.available) continue;
          const content = await manager.getStore().readDocument(sessionId, doc.name, doc.source);
          if (content !== null) entries.push({ name: doc.name, content });
        }
        if (entries.length === 0) {
          json(req, res, 404, { error: "No documents available to download" });
          return;
        }
        const zip = createZipBuffer(entries);
        const suffix = variant === "ai" ? "-ai-context" : "-context";
        const zipName = `${sanitizeFilename(owned.applicationName)}${suffix}.zip`;
        cors(req, res);
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Length": zip.length,
          "Content-Disposition": `attachment; filename="${zipName}"`,
        });
        res.end(zip);
        return;
      }

      const docMatch = rest.match(/^\/documents\/(.+)$/);
      if (docMatch && method === "GET" && !rest.includes("download-all")) {
        const name = decodeURIComponent(docMatch[1]!);
        if (name.includes("..") || name.startsWith("/") || name.startsWith("\\")) {
          json(req, res, 400, { error: "Invalid document name" });
          return;
        }
        const variant = parseDocVariant(url.searchParams.get("variant"));
        const listing = await manager.listDocuments(sessionId, variant);
        const docMeta = listing.documents.find((d) => d.name === name);
        const readVariant = docMeta?.source ?? variant;
        const content = await manager.getStore().readDocument(sessionId, name, readVariant);
        if (content === null) {
          json(req, res, 404, { error: "Document not found" });
          return;
        }
        const download = url.searchParams.get("download") === "1";
        const contentType = name.endsWith(".json")
          ? "application/json; charset=utf-8"
          : "text/markdown; charset=utf-8";
        cors(req, res);
        res.writeHead(200, {
          "Content-Type": contentType,
          ...(download
            ? { "Content-Disposition": `attachment; filename="${path.basename(name)}"` }
            : {}),
        });
        res.end(content);
        return;
      }

      if (rest === "/runs" && method === "GET") {
        const runs = await manager.listRuns(sessionId);
        json(req, res, 200, { runs });
        return;
      }

      if (rest === "/graph" && method === "GET") {
        const graph = await manager.getGraph(sessionId);
        json(req, res, 200, graph);
        return;
      }

      if (rest === "/resume" && method === "POST") {
        const body = await readJsonBody<{
          password?: string;
          headless?: boolean;
          maxPages?: number;
          maxDurationMs?: number;
        }>(req);
        try {
          const session = await manager.resumeExploration(sessionId, body);
          json(req, res, 200, { session });
        } catch (err) {
          json(req, res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (rest === "/stop" && method === "POST") {
        try {
          const session = await manager.stopExploration(sessionId);
          json(req, res, 200, { session });
        } catch (err) {
          json(req, res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (rest === "/pause" && method === "POST") {
        try {
          const session = await manager.pauseExploration(sessionId);
          json(req, res, 200, { session });
        } catch (err) {
          json(req, res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (rest === "/retry" && method === "POST") {
        const body = await readJsonBody<{ password?: string }>(req);
        try {
          const session = await manager.retrySession(sessionId, body.password);
          json(req, res, 201, { session });
        } catch (err) {
          json(req, res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (rest === "/context" && method === "DELETE") {
        try {
          const result = await manager.removeContext(sessionId);
          json(req, res, 200, result);
        } catch (err) {
          json(req, res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }

      if (rest === "" && method === "DELETE") {
        try {
          await manager.deleteSession(sessionId);
          json(req, res, 200, { deleted: true, id: sessionId });
        } catch (err) {
          json(req, res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
    }

    json(req, res, 404, { error: "Not found" });
    return;
  }

  // --- Static UI ---
  if (method === "GET") {
    await serveStatic(req, res, uiRoot, pathname);
    return;
  }

  json(req, res, 405, { error: "Method not allowed" });
}

async function requireOwnedSession(
  req: IncomingMessage,
  res: ServerResponse,
  manager: SessionManager,
  auth: AuthService,
  user: User,
  sessionId: string,
): Promise<ExplorationSession | null> {
  const session = await manager.getSession(sessionId);
  if (!session || !auth.canAccessSession(user, session)) {
    json(req, res, 404, { error: "Session not found" });
    return null;
  }
  return session;
}

async function streamSessionEvents(
  req: IncomingMessage,
  res: ServerResponse,
  manager: SessionManager,
  sessionId: string,
  session: ExplorationSession,
): Promise<void> {
  cors(req, res);
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
  req: IncomingMessage,
  res: ServerResponse,
  uiRoot: string,
  pathname: string,
): Promise<void> {
  let rel = pathname === "/" ? "/index.html" : pathname;
  if (rel.includes("..")) {
    json(req, res, 400, { error: "Invalid path" });
    return;
  }

  const filePath = path.join(uiRoot, rel);
  if (!filePath.startsWith(uiRoot)) {
    json(req, res, 400, { error: "Invalid path" });
    return;
  }

  try {
    const content = await readFile(filePath);
    cors(req, res);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch {
    try {
      const index = await readFile(path.join(uiRoot, "index.html"));
      cors(req, res);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(index);
    } catch {
      json(req, res, 404, { error: "UI assets not found. Ensure the ui/ folder exists." });
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

function isSecureRequest(req: IncomingMessage): boolean {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0]?.trim();
  if (proto === "https") return true;
  // Node http server has no req.secure; treat localhost as non-secure by default.
  return false;
}

function setAuthCookie(
  req: IncomingMessage,
  res: ServerResponse,
  auth: AuthService,
  userId: string,
): void {
  res.setHeader("Set-Cookie", auth.mintCookie(userId, isSecureRequest(req)));
}

function cors(req: IncomingMessage, res: ServerResponse): void {
  const configured = process.env.AE_CORS_ORIGIN?.trim();
  const origin = req.headers.origin;
  if (configured) {
    if (origin && (configured === "*" || configured === origin)) {
      res.setHeader("Access-Control-Allow-Origin", configured === "*" ? origin : configured);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
  } else if (origin) {
    // Same-host browsers sending Origin: reflect only when host matches request Host.
    const host = req.headers.host;
    try {
      const o = new URL(origin);
      if (host && o.host === host) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
      }
    } catch {
      // ignore bad origin
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key",
  );
}

function json(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  cors(req, res);
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

function ndjson(
  req: IncomingMessage,
  res: ServerResponse,
): (event: unknown) => void {
  cors(req, res);
  if (!res.headersSent) {
    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8" });
  }
  return (event: unknown) => {
    res.write(`${JSON.stringify(event)}\n`);
  };
}

function parseDocVariant(value: string | null): "system" | "ai" {
  return value === "ai" ? "ai" : "system";
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
