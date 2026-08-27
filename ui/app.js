/** @typedef {import('../src/sessions/types.ts').ExplorationSession} ExplorationSession */
/** @typedef {import('../src/sessions/types.ts').ExplorationEvent} ExplorationEvent */

const FRAMEWORK_LABELS = {
  independent: "Framework Independent",
  playwright: "Playwright",
  "selenium-java": "Selenium Java",
  "selenium-javascript": "Selenium JavaScript",
  cypress: "Cypress",
  webdriverio: "WebdriverIO",
};

const AUTH_LABELS = {
  none: "None",
  credentials: "Username / password",
  "storage-state": "Storage state",
  "manual-wait": "Manual SSO",
};

const PROFILE_LABELS = {
  fast: "Fast",
  balanced: "Balanced",
  deep: "Deep",
};

const state = {
  sessions: /** @type {ExplorationSession[]} */ ([]),
  selectedId: /** @type {string | null} */ (null),
  events: /** @type {ExplorationEvent[]} */ ([]),
  documents: /** @type {Array<{name:string;label:string;kind:string;description?:string;available:boolean;size?:number}>} */ ([]),
  sse: /** @type {EventSource | null} */ (null),
  pauseRequested: false,
  /** @type {{ id: string; username: string; role: string } | null} */
  user: null,
  authMode: /** @type {"login" | "register"} */ ("login"),
  /** @type {{ empty: HTMLElement; workspace: HTMLElement }} */
  configRoots: { empty: /** @type {any} */ (null), workspace: /** @type {any} */ (null) },
  profile: { empty: "balanced", workspace: "balanced" },
};

const $ = (id) => document.getElementById(id);

const els = {
  viewAuth: /** @type {HTMLElement} */ ($("view-auth")),
  viewEmpty: /** @type {HTMLElement} */ ($("view-empty")),
  viewWorkspace: /** @type {HTMLElement} */ ($("view-workspace")),
  topPill: /** @type {HTMLElement} */ ($("top-pill")),
  userChip: /** @type {HTMLElement} */ ($("user-chip")),
  userName: /** @type {HTMLElement} */ ($("user-name")),
  btnLogout: /** @type {HTMLButtonElement} */ ($("btn-logout")),
  authForm: /** @type {HTMLFormElement} */ ($("auth-form")),
  authTitle: /** @type {HTMLElement} */ ($("auth-title")),
  authSubtitle: /** @type {HTMLElement} */ ($("auth-subtitle")),
  authUsername: /** @type {HTMLInputElement} */ ($("auth-username")),
  authPassword: /** @type {HTMLInputElement} */ ($("auth-password")),
  authError: /** @type {HTMLElement} */ ($("auth-error")),
  btnAuthSubmit: /** @type {HTMLButtonElement} */ ($("btn-auth-submit")),
  btnAuthToggle: /** @type {HTMLButtonElement} */ ($("btn-auth-toggle")),
  btnAuthAzure: /** @type {HTMLButtonElement} */ ($("btn-auth-azure")),
  emptyForm: /** @type {HTMLFormElement} */ ($("empty-form")),
  emptyUrl: /** @type {HTMLInputElement} */ ($("empty-url")),
  emptyError: /** @type {HTMLElement} */ ($("empty-error")),
  emptyConfig: /** @type {HTMLElement} */ ($("empty-config")),
  btnEmptyConfig: /** @type {HTMLButtonElement} */ ($("btn-empty-config")),
  wsForm: /** @type {HTMLFormElement} */ ($("ws-form")),
  wsUrl: /** @type {HTMLInputElement} */ ($("ws-url")),
  wsError: /** @type {HTMLElement} */ ($("ws-error")),
  wsConfig: /** @type {HTMLElement} */ ($("ws-config")),
  btnWsConfig: /** @type {HTMLButtonElement} */ ($("btn-ws-config")),
  sessionList: /** @type {HTMLElement} */ ($("session-list")),
  sessionsEmpty: /** @type {HTMLElement} */ ($("sessions-empty")),
  appName: /** @type {HTMLElement} */ ($("app-name")),
  appMeta: /** @type {HTMLElement} */ ($("app-meta")),
  btnPause: /** @type {HTMLButtonElement} */ ($("btn-pause")),
  btnResumeRun: /** @type {HTMLButtonElement} */ ($("btn-resume-run")),
  btnStop: /** @type {HTMLButtonElement} */ ($("btn-stop")),
  ssoBanner: /** @type {HTMLElement} */ ($("sso-banner")),
  btnSsoStop: /** @type {HTMLButtonElement} */ ($("btn-sso-stop")),
  limitBanner: /** @type {HTMLElement} */ ($("limit-banner")),
  limitText: /** @type {HTMLElement} */ ($("limit-text")),
  failedBanner: /** @type {HTMLElement} */ ($("failed-banner")),
  failedReason: /** @type {HTMLElement} */ ($("failed-reason")),
  btnRetry: /** @type {HTMLButtonElement} */ ($("btn-retry")),
  stream: /** @type {HTMLElement} */ ($("stream")),
  streamEmpty: /** @type {HTMLElement} */ ($("stream-empty")),
  sheetDetails: /** @type {HTMLElement} */ ($("sheet-details")),
  sheetDocs: /** @type {HTMLElement} */ ($("sheet-docs")),
  detailsKv: /** @type {HTMLElement} */ ($("details-kv")),
  docList: /** @type {HTMLElement} */ ($("doc-list")),
  docsEmpty: /** @type {HTMLElement} */ ($("docs-empty")),
  btnDownloadZip: /** @type {HTMLButtonElement} */ ($("btn-download-zip")),
  btnRemoveContext: /** @type {HTMLButtonElement} */ ($("btn-remove-context")),
  btnDeleteSession: /** @type {HTMLButtonElement} */ ($("btn-delete-session")),
  nPages: /** @type {HTMLElement} */ ($("n-pages")),
  nEls: /** @type {HTMLElement} */ ($("n-els")),
  nSkip: /** @type {HTMLElement} */ ($("n-skip")),
  nEta: /** @type {HTMLElement} */ ($("n-eta")),
  btnDetails: /** @type {HTMLButtonElement} */ ($("btn-details")),
  btnDocs: /** @type {HTMLButtonElement} */ ($("btn-docs")),
  btnResumeCtx: /** @type {HTMLButtonElement} */ ($("btn-resume-ctx")),
  btnTheme: /** @type {HTMLButtonElement} */ ($("btn-theme")),
  docModal: /** @type {HTMLElement} */ ($("doc-modal")),
  docModalTitle: /** @type {HTMLElement} */ ($("doc-modal-title")),
  docContent: /** @type {HTMLElement} */ ($("doc-content")),
  docCopy: /** @type {HTMLButtonElement} */ ($("doc-copy")),
  docClose: /** @type {HTMLButtonElement} */ ($("doc-close")),
  tplConfig: /** @type {HTMLTemplateElement} */ ($("tpl-config")),
};

class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(path, options) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    showLogin();
    throw new ApiError(data.error || "Not authenticated", 401);
  }
  if (!res.ok) throw new ApiError(data.error || res.statusText || "Request failed", res.status);
  return data;
}

function selectedSession() {
  return state.sessions.find((s) => s.id === state.selectedId) || null;
}

function isLive(status) {
  return (
    status === "created" ||
    status === "initializing" ||
    status === "exploring" ||
    status === "re-exploring"
  );
}

function canResume(status) {
  return status === "completed" || status === "failed" || status === "paused";
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (Number.isNaN(start)) return "—";
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url || "";
  }
}

function frameworkLabel(fw) {
  return FRAMEWORK_LABELS[fw] || fw || "Framework Independent";
}

function statusPill(status) {
  if (isLive(status)) return { text: "Exploring", cls: "pill dot" };
  if (status === "paused") return { text: "Paused", cls: "pill paused dot" };
  if (status === "completed") return { text: "Completed", cls: "pill" };
  if (status === "failed") return { text: "Failed", cls: "pill failed" };
  return { text: "No sessions", cls: "pill idle" };
}

function mountConfigPanels() {
  const tpl = els.tplConfig;
  for (const key of /** @type {const} */ (["empty", "workspace"])) {
    const root = key === "empty" ? els.emptyConfig : els.wsConfig;
    root.innerHTML = "";
    root.appendChild(tpl.content.cloneNode(true));
    const heading = root.querySelector(".cfg-heading");
    if (heading) heading.textContent = key === "empty" ? "Optional settings" : "Configure";
    state.configRoots[key] = root;

    const profiles = root.querySelector("[data-profiles]");
    profiles?.addEventListener("click", (e) => {
      const btn = /** @type {HTMLElement} */ (e.target).closest(".profile");
      if (!btn) return;
      profiles.querySelectorAll(".profile").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      state.profile[key] = btn.getAttribute("data-p") || "balanced";
      syncProfileChecks(key);
    });

    const auth = /** @type {HTMLSelectElement | null} */ (root.querySelector(".cfg-auth-mode"));
    auth?.addEventListener("change", () => syncAuthUi(key));
    syncAuthUi(key);
    syncProfileChecks(key);
  }
}

function syncAuthUi(key) {
  const root = state.configRoots[key];
  if (!root) return;
  const mode = /** @type {HTMLSelectElement} */ (root.querySelector(".cfg-auth-mode")).value;
  root.querySelector(".cfg-storage-wrap")?.classList.toggle("hidden", mode !== "storage-state");
}

function syncProfileChecks(key) {
  const root = state.configRoots[key];
  if (!root) return;
  const profile = state.profile[key];
  const consent = /** @type {HTMLInputElement} */ (root.querySelector(".cfg-consent"));
  const shadow = /** @type {HTMLInputElement} */ (root.querySelector(".cfg-shadow"));
  const frames = /** @type {HTMLInputElement} */ (root.querySelector(".cfg-frames"));
  if (!consent.dataset.touched) consent.checked = profile === "balanced" || profile === "deep";
  if (!shadow.dataset.touched) shadow.checked = profile === "deep";
  if (!frames.dataset.touched) frames.checked = profile === "deep";
}

function readConfig(key) {
  const root = state.configRoots[key];
  const username = /** @type {HTMLInputElement} */ (root.querySelector(".cfg-username")).value.trim();
  const password = /** @type {HTMLInputElement} */ (root.querySelector(".cfg-password")).value;
  const framework = /** @type {HTMLSelectElement} */ (root.querySelector(".cfg-framework")).value;
  const authMode = /** @type {HTMLSelectElement} */ (root.querySelector(".cfg-auth-mode")).value;
  const storageState = /** @type {HTMLInputElement} */ (root.querySelector(".cfg-storage-state")).value.trim();
  const allowRaw = /** @type {HTMLTextAreaElement} */ (root.querySelector(".cfg-allowlist")).value;
  const domainAllowlist = allowRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const dismissConsent = /** @type {HTMLInputElement} */ (root.querySelector(".cfg-consent")).checked;
  const exploreOpenShadow = /** @type {HTMLInputElement} */ (root.querySelector(".cfg-shadow")).checked;
  const exploreSameOriginFrames = /** @type {HTMLInputElement} */ (root.querySelector(".cfg-frames")).checked;

  /** @type {Record<string, unknown>} */
  const payload = {
    framework,
    stabilityProfile: state.profile[key],
    authMode,
    dismissConsent,
    exploreOpenShadow,
    exploreSameOriginFrames,
  };
  if (username) payload.username = username;
  if (password) payload.password = password;
  if (storageState) payload.storageState = storageState;
  if (domainAllowlist.length) payload.domainAllowlist = domainAllowlist;
  if (authMode === "manual-wait") payload.headless = false;
  return payload;
}

function showShell() {
  const authed = Boolean(state.user);
  els.viewAuth.classList.toggle("hidden", authed);
  els.userChip.classList.toggle("hidden", !authed);
  els.topPill.classList.toggle("hidden", !authed);
  if (state.user) {
    els.userName.textContent = state.user.username;
  }

  if (!authed) {
    els.viewEmpty.classList.add("hidden");
    els.viewWorkspace.classList.remove("show");
    return;
  }

  const hasSessions = state.sessions.length > 0;
  els.viewEmpty.classList.toggle("hidden", hasSessions);
  els.viewWorkspace.classList.toggle("show", hasSessions);
  if (!hasSessions) {
    els.topPill.className = "pill idle";
    els.topPill.textContent = "No sessions";
  }
}

function showLogin() {
  closeSse();
  state.user = null;
  state.sessions = [];
  state.selectedId = null;
  state.events = [];
  state.documents = [];
  state.pauseRequested = false;
  setAuthMode("login");
  showShell();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isLogin = mode === "login";
  els.authTitle.textContent = isLogin ? "Sign in" : "Create account";
  els.authSubtitle.textContent = isLogin
    ? "Each explorer account keeps its own sessions. Multiple users can explore in parallel."
    : "Register to start exploring. The first account becomes admin.";
  els.btnAuthSubmit.textContent = isLogin ? "Sign in" : "Register";
  els.btnAuthToggle.textContent = isLogin
    ? "Need an account? Register"
    : "Already have an account? Sign in";
  els.authPassword.autocomplete = isLogin ? "current-password" : "new-password";
  els.authError.classList.add("hidden");
  els.authError.textContent = "";
}

async function loadProviders() {
  try {
    const data = await fetch("/api/auth/providers", { credentials: "include" }).then((r) =>
      r.json(),
    );
    const azure = (data.providers || []).find((p) => p.id === "azure" && p.enabled);
    els.btnAuthAzure.classList.toggle("hidden", !azure);
    els.btnAuthAzure.disabled = !azure;
  } catch {
    els.btnAuthAzure.classList.add("hidden");
  }
}

function upsertSession(session) {
  const idx = state.sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) state.sessions[idx] = session;
  else state.sessions.unshift(session);
  showShell();
  renderSessionList();
  if (session.id === state.selectedId) renderMain(session);
  else updateTopPill();
}

function updateTopPill(session = selectedSession()) {
  if (!session) {
    const live = state.sessions.find((s) => isLive(s.status));
    if (live) {
      const p = statusPill(live.status);
      els.topPill.className = p.cls;
      els.topPill.textContent = p.text;
      return;
    }
    if (!state.sessions.length) {
      els.topPill.className = "pill idle";
      els.topPill.textContent = "No sessions";
      return;
    }
    const p = statusPill(state.sessions[0].status);
    els.topPill.className = p.cls;
    els.topPill.textContent = p.text;
    return;
  }
  const p = statusPill(session.status);
  els.topPill.className = p.cls;
  els.topPill.textContent = p.text;
}

function renderSessionList() {
  els.sessionList.innerHTML = "";
  els.sessionsEmpty.classList.toggle("hidden", state.sessions.length > 0);
  for (const s of state.sessions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `session${s.id === state.selectedId ? " active" : ""}`;
    btn.innerHTML = `<strong></strong><div class="sub"></div>`;
    btn.querySelector("strong").textContent = s.applicationName;
    btn.querySelector(".sub").textContent = hostOf(s.applicationUrl);
    btn.addEventListener("click", () => selectSession(s.id));
    els.sessionList.appendChild(btn);
  }
}

function skipReasonOf(ev) {
  const meta = ev.metadata || {};
  return meta.skipReason || (ev.type === "action_skipped" ? meta.reason : null);
}

function renderStream(events) {
  const nearBottom =
    els.stream.scrollHeight - els.stream.scrollTop - els.stream.clientHeight < 80;
  els.stream.innerHTML = "";
  if (!events.length) {
    els.stream.appendChild(els.streamEmpty);
    els.streamEmpty.classList.remove("hidden");
    return;
  }
  els.streamEmpty.classList.add("hidden");
  for (const ev of events) {
    const row = document.createElement("div");
    row.className = "ev";
    const skip = skipReasonOf(ev);
    row.innerHTML = `<time></time><div class="body"></div>`;
    row.querySelector("time").textContent = formatTime(ev.timestamp);
    const body = row.querySelector(".body");
    body.textContent = ev.title + (ev.description ? ` — ${ev.description}` : "");
    if (skip) {
      const chip = document.createElement("span");
      chip.className = "skip";
      chip.textContent = String(skip);
      body.appendChild(chip);
    }
    els.stream.appendChild(row);
  }
  if (nearBottom || events.length <= 6) {
    requestAnimationFrame(() => {
      els.stream.scrollTop = els.stream.scrollHeight;
    });
  }
}

function topSkipReasons(events) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const ev of events) {
    const code = skipReasonOf(ev);
    if (!code) continue;
    counts[String(code)] = (counts[String(code)] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k} ×${v}`)
    .join(" · ");
}

function renderDetails(session) {
  const skips = session?.statistics?.skipped ?? state.events.filter((e) => e.type === "action_skipped").length;
  const rows = [
    ["Profile", PROFILE_LABELS[session?.stabilityProfile || "balanced"] || "Balanced"],
    ["Auth", AUTH_LABELS[session?.authMode || "none"] || "None"],
    [
      "Coverage",
      `Main ${session?.statistics?.elements ?? 0} · Shadow — · Frames — · Skipped ${skips}`,
    ],
    ["Top skips", topSkipReasons(state.events) || "—"],
    ["Allowlist", (session?.domainAllowlist || []).join(", ") || hostOf(session?.applicationUrl || "")],
    ["Framework", frameworkLabel(session?.framework)],
    ["Status", session?.status || "—"],
  ];
  els.detailsKv.innerHTML = rows
    .map(
      ([dt, dd]) =>
        `<dt>${escapeHtml(dt)}</dt><dd class="${dt === "Allowlist" ? "mono" : ""}">${escapeHtml(String(dd))}</dd>`,
    )
    .join("");
}

function renderDocs(documents, session = selectedSession()) {
  const available = documents.filter((d) => d.available);
  const live = session ? isLive(session.status) : false;
  els.docsEmpty.classList.toggle("hidden", available.length > 0);
  els.btnDownloadZip.disabled = available.length === 0;
  els.btnRemoveContext.disabled = available.length === 0 || live;
  els.btnDeleteSession.disabled = !session || live;
  els.docList.innerHTML = "";
  for (const doc of documents) {
    const row = document.createElement("div");
    row.className = `doc-row${doc.available ? "" : " unavailable"}`;
    const name = document.createElement("span");
    name.textContent = doc.name;
    const actions = document.createElement("div");
    if (doc.available && state.selectedId) {
      const view = document.createElement("button");
      view.type = "button";
      view.className = "linkish";
      view.textContent = "View";
      view.addEventListener("click", () => openDocument(state.selectedId, doc.name));
      const dl = document.createElement("a");
      dl.className = "linkish";
      dl.textContent = "Download";
      dl.href = `/api/sessions/${encodeURIComponent(state.selectedId)}/documents/${encodeURIComponent(doc.name)}?download=1`;
      dl.download = doc.name.split("/").pop() || doc.name;
      actions.append(view, document.createTextNode(" · "), dl);
    } else {
      actions.textContent = "—";
    }
    row.append(name, actions);
    els.docList.appendChild(row);
  }
}

function renderMain(session) {
  if (!session) {
    els.appName.textContent = "Select a session";
    els.appMeta.textContent = "Start or pick a session";
    els.nPages.textContent = "0";
    els.nEls.textContent = "0";
    els.nSkip.textContent = "0";
    els.nEta.textContent = "—";
    els.btnPause.classList.add("hidden");
    els.btnResumeRun.classList.add("hidden");
    els.btnStop.classList.add("hidden");
    els.btnResumeCtx.classList.add("hidden");
    els.limitBanner.classList.remove("show");
    els.failedBanner.classList.add("hidden");
    els.ssoBanner.classList.remove("show");
    renderStream([]);
    renderDetails(null);
    renderDocs([]);
    updateTopPill(null);
    return;
  }

  const live = isLive(session.status);
  const skipped = session.statistics?.skipped ?? 0;
  const profile = PROFILE_LABELS[session.stabilityProfile || "balanced"] || "Balanced";
  const duration = formatDuration(session.startedAt || session.createdAt, session.completedAt);

  els.appName.textContent = session.applicationName;
  els.appMeta.textContent = [
    hostOf(session.applicationUrl),
    frameworkLabel(session.framework),
    profile,
    session.status === "completed" ? duration : null,
  ]
    .filter(Boolean)
    .join(" · ");

  els.nPages.textContent = String(session.statistics?.pages ?? 0);
  els.nEls.textContent = String(session.statistics?.elements ?? 0);
  els.nSkip.textContent = String(skipped);
  els.nEta.textContent = live
    ? formatDuration(session.startedAt || session.createdAt)
    : session.status === "completed"
      ? "0:00"
      : "—";

  els.btnPause.classList.toggle("hidden", !live);
  els.btnPause.disabled = !live || state.pauseRequested;
  els.btnStop.classList.toggle("hidden", !(live || session.status === "paused"));
  els.btnStop.disabled = (!live && session.status === "paused") || state.pauseRequested;
  els.btnResumeRun.classList.toggle("hidden", session.status !== "paused" || live);
  els.btnResumeCtx.classList.toggle("hidden", !canResume(session.status) || live);

  if (live && state.pauseRequested) {
    els.topPill.className = "pill paused dot";
    els.topPill.textContent = "Pausing";
  } else {
    updateTopPill(session);
  }

  const showLimit = session.status === "completed" && skipped > 0;
  els.limitBanner.classList.toggle("show", showLimit);
  if (showLimit) {
    els.limitText.textContent = `${skipped} action${skipped === 1 ? "" : "s"} skipped. Notes are included in CONTEXT.md.`;
  }

  els.failedBanner.classList.toggle("hidden", session.status !== "failed");
  if (session.status === "failed") {
    els.failedReason.textContent = session.error || "Unknown error";
  }

  els.ssoBanner.classList.toggle("show", session.authMode === "manual-wait" && live);

  renderStream(state.events);
  renderDetails(session);
  renderDocs(state.documents, session);
  if (!(live && state.pauseRequested)) updateTopPill(session);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function closeSheets() {
  els.sheetDetails.classList.remove("open");
  els.sheetDocs.classList.remove("open");
}

function closeSse() {
  if (state.sse) {
    state.sse.close();
    state.sse = null;
  }
}

function connectSse(sessionId) {
  closeSse();
  const es = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events/stream`, {
    withCredentials: true,
  });
  state.sse = es;

  es.addEventListener("snapshot", (msg) => {
    const data = JSON.parse(msg.data);
    if (data.session) upsertSession(data.session);
    state.events = data.events || [];
    if (data.session?.id === state.selectedId) renderMain(data.session);
    void refreshDocuments(sessionId);
  });

  es.addEventListener("event", (msg) => {
    const event = JSON.parse(msg.data);
    if (event.sessionId !== state.selectedId) return;
    if (!state.events.some((e) => e.id === event.id)) {
      state.events.push(event);
      renderStream(state.events);
      const session = selectedSession();
      if (session && event.statistics) {
        session.statistics = { ...session.statistics, ...event.statistics };
        renderMain(session);
      } else if (session) {
        renderDetails(session);
      }
    }
  });

  es.addEventListener("session", (msg) => {
    const session = JSON.parse(msg.data);
    if (
      session.id === state.selectedId &&
      (session.status === "paused" ||
        session.status === "completed" ||
        session.status === "failed")
    ) {
      state.pauseRequested = false;
    }
    upsertSession(session);
    if (session.id === state.selectedId) {
      renderMain(session);
      if (session.status === "completed" || session.status === "failed" || session.status === "paused") {
        void refreshDocuments(session.id);
      }
    }
  });

  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      // Likely auth failure or server restart — re-check session.
      void api("/api/auth/me").catch(() => showLogin());
    }
  };
}

async function refreshDocuments(sessionId) {
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(sessionId)}/documents`);
    state.documents = data.documents || [];
    if (sessionId === state.selectedId) renderDocs(state.documents, selectedSession());
  } catch {
    /* ignore */
  }
}

async function selectSession(sessionId) {
  state.selectedId = sessionId;
  closeSheets();
  renderSessionList();
  try {
    const [{ session }, { events }, { documents }] = await Promise.all([
      api(`/api/sessions/${encodeURIComponent(sessionId)}`),
      api(`/api/sessions/${encodeURIComponent(sessionId)}/events`),
      api(`/api/sessions/${encodeURIComponent(sessionId)}/documents`),
    ]);
    upsertSession(session);
    state.events = events || [];
    state.documents = documents || [];
    renderMain(session);
    connectSse(sessionId);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
}

async function startExploration(url, configKey, errorEl) {
  errorEl.classList.add("hidden");
  errorEl.textContent = "";
  if (!url) {
    errorEl.textContent = "Application URL is required";
    errorEl.classList.remove("hidden");
    return;
  }
  try {
    const payload = { url, ...readConfig(configKey) };
    const { session } = await api("/api/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    upsertSession(session);
    await selectSession(session.id);
    els.emptyConfig.classList.remove("open");
    els.wsConfig.classList.remove("open");
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : String(err);
    errorEl.classList.remove("hidden");
  }
}

async function openDocument(sessionId, name) {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/documents/${encodeURIComponent(name)}`,
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || "Could not load document");
    return;
  }
  els.docModalTitle.textContent = name;
  els.docContent.textContent = await res.text();
  els.docCopy.textContent = "Copy";
  els.docModal.classList.remove("hidden");
}

function bindEvents() {
  els.btnTheme.addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    els.btnTheme.title = next === "dark" ? "Switch to light theme" : "Switch to dark theme";
    els.btnTheme.setAttribute("aria-label", els.btnTheme.title);
    try {
      localStorage.setItem("ae-theme", next);
    } catch {
      /* ignore */
    }
  });

  els.btnAuthToggle.addEventListener("click", () => {
    setAuthMode(state.authMode === "login" ? "register" : "login");
  });

  els.authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.authError.classList.add("hidden");
    const username = els.authUsername.value.trim();
    const password = els.authPassword.value;
    const path = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    try {
      const data = await api(path, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      state.user = data.user;
      els.authPassword.value = "";
      await enterApp();
    } catch (err) {
      els.authError.textContent = err instanceof Error ? err.message : String(err);
      els.authError.classList.remove("hidden");
    }
  });

  els.btnLogout.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    showLogin();
  });

  els.btnAuthAzure.addEventListener("click", () => {
    window.location.href = "/api/auth/azure/start";
  });

  els.btnEmptyConfig.addEventListener("click", () => {
    els.emptyConfig.classList.toggle("open");
  });
  els.btnWsConfig.addEventListener("click", () => {
    els.wsConfig.classList.toggle("open");
  });

  els.emptyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void startExploration(els.emptyUrl.value.trim(), "empty", els.emptyError);
  });
  els.wsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void startExploration(els.wsUrl.value.trim(), "workspace", els.wsError);
  });

  els.btnDetails.addEventListener("click", () => {
    const open = !els.sheetDetails.classList.contains("open");
    closeSheets();
    if (open) els.sheetDetails.classList.add("open");
  });
  els.btnDocs.addEventListener("click", () => {
    const open = !els.sheetDocs.classList.contains("open");
    closeSheets();
    if (open) els.sheetDocs.classList.add("open");
  });

  els.btnPause.addEventListener("click", async () => {
    if (!state.selectedId || state.pauseRequested) return;
    state.pauseRequested = true;
    renderMain(selectedSession());
    try {
      const { session } = await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/pause`, {
        method: "POST",
        body: "{}",
      });
      upsertSession(session);
    } catch (err) {
      state.pauseRequested = false;
      renderMain(selectedSession());
      alert(err instanceof Error ? err.message : String(err));
    }
  });

  els.btnStop.addEventListener("click", async () => {
    if (!state.selectedId || state.pauseRequested) return;
    state.pauseRequested = true;
    renderMain(selectedSession());
    try {
      const { session } = await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/stop`, {
        method: "POST",
        body: "{}",
      });
      upsertSession(session);
    } catch (err) {
      state.pauseRequested = false;
      renderMain(selectedSession());
      alert(err instanceof Error ? err.message : String(err));
    }
  });
  els.btnSsoStop.addEventListener("click", () => els.btnStop.click());

  const resume = async () => {
    if (!state.selectedId) return;
    const current = selectedSession();
    if (current && isLive(current.status)) {
      alert("Exploration is still stopping. Wait until status is Paused, then Resume.");
      return;
    }
    try {
      const { session } = await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/resume`, {
        method: "POST",
        body: "{}",
      });
      state.pauseRequested = false;
      upsertSession(session);
      state.events = [];
      await selectSession(session.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };
  els.btnResumeRun.addEventListener("click", () => void resume());
  els.btnResumeCtx.addEventListener("click", () => void resume());
  els.btnRetry.addEventListener("click", () => void resume());

  els.btnDownloadZip.addEventListener("click", () => {
    if (!state.selectedId || els.btnDownloadZip.disabled) return;
    window.location.href = `/api/sessions/${encodeURIComponent(state.selectedId)}/documents/download-all`;
  });

  els.btnRemoveContext.addEventListener("click", async () => {
    if (!state.selectedId || els.btnRemoveContext.disabled) return;
    const session = selectedSession();
    const label = session?.applicationName || "this session";
    if (!confirm(`Remove generated context for “${label}”? Session stays; docs will be cleared.`)) {
      return;
    }
    try {
      await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/context`, {
        method: "DELETE",
      });
      await refreshDocuments(state.selectedId);
      renderMain(selectedSession());
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  });

  els.btnDeleteSession.addEventListener("click", async () => {
    if (!state.selectedId || els.btnDeleteSession.disabled) return;
    const session = selectedSession();
    const label = session?.applicationName || "this session";
    if (
      !confirm(
        `Delete session “${label}”? This removes the session, memory, and all generated documents.`,
      )
    ) {
      return;
    }
    const id = state.selectedId;
    try {
      await api(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
      closeSse();
      closeSheets();
      state.sessions = state.sessions.filter((s) => s.id !== id);
      state.selectedId = null;
      state.events = [];
      state.documents = [];
      state.pauseRequested = false;
      showShell();
      renderSessionList();
      if (state.sessions.length) {
        await selectSession(state.sessions[0].id);
      } else {
        renderMain(null);
        updateTopPill(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  });

  els.docClose.addEventListener("click", () => els.docModal.classList.add("hidden"));
  els.docCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.docContent.textContent || "");
      els.docCopy.textContent = "Copied";
      setTimeout(() => {
        els.docCopy.textContent = "Copy";
      }, 1200);
    } catch {
      alert("Could not copy");
    }
  });
  els.docModal.addEventListener("click", (e) => {
    if (e.target === els.docModal) els.docModal.classList.add("hidden");
  });

  for (const key of /** @type {const} */ (["empty", "workspace"])) {
    const root = state.configRoots[key];
    for (const sel of [".cfg-consent", ".cfg-shadow", ".cfg-frames"]) {
      const input = /** @type {HTMLInputElement | null} */ (root.querySelector(sel));
      input?.addEventListener("change", () => {
        input.dataset.touched = "1";
      });
    }
  }
}

async function enterApp() {
  showShell();
  try {
    const data = await api("/api/sessions");
    state.sessions = data.sessions || [];
    showShell();
    renderSessionList();
    if (!state.sessions.length) {
      renderMain(null);
      return;
    }
    const prefer = state.sessions.find((s) => isLive(s.status)) || state.sessions[0];
    await selectSession(prefer.id);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) {
      console.error(err);
    }
  }
}

async function boot() {
  mountConfigPanels();
  bindEvents();
  setAuthMode("login");
  void loadProviders();
  showShell();
  try {
    const me = await fetch("/api/auth/me", { credentials: "include" }).then(async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || null;
    });
    if (!me) {
      showLogin();
      return;
    }
    state.user = me;
    await enterApp();
  } catch (err) {
    console.error(err);
    showLogin();
  }
}

void boot();
