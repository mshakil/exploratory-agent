/** @typedef {import('../src/sessions/types.ts').ExplorationSession} ExplorationSession */
/** @typedef {import('../src/sessions/types.ts').ExplorationEvent} ExplorationEvent */

const state = {
  sessions: /** @type {ExplorationSession[]} */ ([]),
  selectedId: /** @type {string | null} */ (null),
  events: /** @type {ExplorationEvent[]} */ ([]),
  documents: /** @type {Array<{name:string;label:string;kind:string;available:boolean}>} */ ([]),
  sse: /** @type {EventSource | null} */ (null),
  autoScroll: true,
  durationTimer: /** @type {number | null} */ (null),
};

const els = {
  startForm: /** @type {HTMLFormElement} */ (document.getElementById("start-form")),
  inputUrl: /** @type {HTMLInputElement} */ (document.getElementById("input-url")),
  inputUsername: /** @type {HTMLInputElement} */ (document.getElementById("input-username")),
  inputPassword: /** @type {HTMLInputElement} */ (document.getElementById("input-password")),
  inputMaxPages: /** @type {HTMLInputElement} */ (document.getElementById("input-max-pages")),
  inputMaxDuration: /** @type {HTMLInputElement} */ (document.getElementById("input-max-duration")),
  formError: /** @type {HTMLElement} */ (document.getElementById("form-error")),
  btnStart: /** @type {HTMLButtonElement} */ (document.getElementById("btn-start")),
  btnTogglePassword: /** @type {HTMLButtonElement} */ (document.getElementById("btn-toggle-password")),
  activeSessionCard: /** @type {HTMLElement} */ (document.getElementById("active-session-card")),
  activeSessionName: /** @type {HTMLElement} */ (document.getElementById("active-session-name")),
  activeSessionStatus: /** @type {HTMLElement} */ (document.getElementById("active-session-status")),
  activeSessionStarted: /** @type {HTMLElement} */ (document.getElementById("active-session-started")),
  activeSessionDuration: /** @type {HTMLElement} */ (document.getElementById("active-session-duration")),
  btnViewActive: /** @type {HTMLButtonElement} */ (document.getElementById("btn-view-active")),
  recentList: /** @type {HTMLElement} */ (document.getElementById("recent-list")),
  recentEmpty: /** @type {HTMLElement} */ (document.getElementById("recent-empty")),
  liveBadge: /** @type {HTMLElement} */ (document.getElementById("live-badge")),
  toggleAutoscroll: /** @type {HTMLInputElement} */ (document.getElementById("toggle-autoscroll")),
  btnClearCanvas: /** @type {HTMLButtonElement} */ (document.getElementById("btn-clear-canvas")),
  progressLabel: /** @type {HTMLElement} */ (document.getElementById("progress-label")),
  progressPct: /** @type {HTMLElement} */ (document.getElementById("progress-pct")),
  progressTrack: /** @type {HTMLElement} */ (document.getElementById("progress-track")),
  progressFill: /** @type {HTMLElement} */ (document.getElementById("progress-fill")),
  statPages: /** @type {HTMLElement} */ (document.getElementById("stat-pages")),
  statElements: /** @type {HTMLElement} */ (document.getElementById("stat-elements")),
  statActions: /** @type {HTMLElement} */ (document.getElementById("stat-actions")),
  statFlows: /** @type {HTMLElement} */ (document.getElementById("stat-flows")),
  timeline: /** @type {HTMLOListElement} */ (document.getElementById("event-timeline")),
  canvasEmpty: /** @type {HTMLElement} */ (document.getElementById("canvas-empty")),
  canvasScroll: /** @type {HTMLElement} */ (document.getElementById("canvas-scroll")),
  failedBanner: /** @type {HTMLElement} */ (document.getElementById("failed-banner")),
  failedReason: /** @type {HTMLElement} */ (document.getElementById("failed-reason")),
  btnRetry: /** @type {HTMLButtonElement} */ (document.getElementById("btn-retry")),
  btnNewSession: /** @type {HTMLButtonElement} */ (document.getElementById("btn-new-session")),
  contextName: /** @type {HTMLElement} */ (document.getElementById("context-name")),
  contextUrl: /** @type {HTMLElement} */ (document.getElementById("context-url")),
  contextStatusPill: /** @type {HTMLElement} */ (document.getElementById("context-status-pill")),
  contextStarted: /** @type {HTMLElement} */ (document.getElementById("context-started")),
  btnSessionMenu: /** @type {HTMLButtonElement} */ (document.getElementById("btn-session-menu")),
  sessionMenu: /** @type {HTMLElement} */ (document.getElementById("session-menu")),
  docList: /** @type {HTMLElement} */ (document.getElementById("doc-list")),
  docsEmpty: /** @type {HTMLElement} */ (document.getElementById("docs-empty")),
  btnDownloadAll: /** @type {HTMLButtonElement} */ (document.getElementById("btn-download-all")),
  btnRemoveContext: /** @type {HTMLButtonElement} */ (document.getElementById("btn-remove-context")),
  btnDeleteSession: /** @type {HTMLButtonElement} */ (document.getElementById("btn-delete-session")),
  panelDocuments: /** @type {HTMLElement} */ (document.getElementById("panel-documents")),
  panelOverview: /** @type {HTMLElement} */ (document.getElementById("panel-overview")),
  tabDocuments: /** @type {HTMLButtonElement} */ (document.getElementById("tab-documents")),
  tabOverview: /** @type {HTMLButtonElement} */ (document.getElementById("tab-overview")),
  ovPages: /** @type {HTMLElement} */ (document.getElementById("ov-pages")),
  ovElements: /** @type {HTMLElement} */ (document.getElementById("ov-elements")),
  ovActions: /** @type {HTMLElement} */ (document.getElementById("ov-actions")),
  ovFlows: /** @type {HTMLElement} */ (document.getElementById("ov-flows")),
  ovStatus: /** @type {HTMLElement} */ (document.getElementById("ov-status")),
  ovStarted: /** @type {HTMLElement} */ (document.getElementById("ov-started")),
  ovCompleted: /** @type {HTMLElement} */ (document.getElementById("ov-completed")),
  ovId: /** @type {HTMLElement} */ (document.getElementById("ov-id")),
  allSessionList: /** @type {HTMLElement} */ (document.getElementById("all-session-list")),
  btnViewAll: /** @type {HTMLButtonElement} */ (document.getElementById("btn-view-all")),
  docModal: /** @type {HTMLElement} */ (document.getElementById("doc-modal")),
  docModalTitle: /** @type {HTMLElement} */ (document.getElementById("doc-modal-title")),
  docContent: /** @type {HTMLElement} */ (document.getElementById("doc-content")),
  docCopy: /** @type {HTMLButtonElement} */ (document.getElementById("doc-copy")),
  docClose: /** @type {HTMLButtonElement} */ (document.getElementById("doc-close")),
  btnHelp: /** @type {HTMLButtonElement} */ (document.getElementById("btn-help")),
};

const ICONS = {
  view: `<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>`,
  folder: `<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>`,
  browser: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>`,
  nav: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18"/></svg>`,
  page: `<svg viewBox="0 0 24 24"><path d="M8 3h6l5 5v13a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/></svg>`,
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  click: `<svg viewBox="0 0 24 24"><path d="M9 3v11l3-2 2 5 2-1-2-5 4-1L9 3z"/></svg>`,
  flow: `<svg viewBox="0 0 24 24"><path d="M6 3v6M18 15v6M6 9a3 3 0 100 6 3 3 0 000-6zM18 9a3 3 0 100 6 3 3 0 000-6zM9 12h6"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`,
  fail: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

function selectedSession() {
  return state.sessions.find((s) => s.id === state.selectedId) || null;
}

function isLive(status) {
  return status === "created" || status === "initializing" || status === "exploring";
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
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
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function statusLabel(status) {
  if (status === "exploring" || status === "initializing") return "Active";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return status;
}

function badgeForEvent(ev) {
  if (ev.type === "elements_discovered") {
    const count = ev.metadata?.count;
    return { text: count != null ? `${count} elements` : "Elements", cls: "info" };
  }
  if (ev.type === "page_discovered") return { text: "New Page", cls: "info" };
  if (ev.type === "flow_discovered") return { text: "Flow", cls: "info" };
  if (ev.status === "success") return { text: "Success", cls: "success" };
  if (ev.status === "failed") return { text: "Failed", cls: "failed" };
  if (ev.status === "skipped") return { text: "Skipped", cls: "skipped" };
  return { text: "In Progress", cls: "running" };
}

function iconForEvent(ev) {
  if (ev.type.startsWith("browser")) return ICONS.browser;
  if (ev.type.startsWith("navigation")) return ICONS.nav;
  if (ev.type === "page_discovered") return ICONS.page;
  if (ev.type === "elements_discovered") return ICONS.search;
  if (ev.type === "flow_discovered") return ICONS.flow;
  if (ev.type.includes("failed")) return ICONS.fail;
  if (ev.type === "exploration_completed") return ICONS.check;
  if (ev.type.startsWith("action")) return ICONS.click;
  return ICONS.page;
}

function focusStartForm() {
  closeMenu();
  els.inputUrl.focus();
  els.startForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function upsertSession(session) {
  const idx = state.sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) state.sessions[idx] = session;
  else state.sessions.unshift(session);
  renderSessionLists();
  if (session.id === state.selectedId) renderSessionDetail(session);
  renderActiveSessionCard();
}

function renderSessionLists() {
  els.recentList.innerHTML = "";
  els.allSessionList.innerHTML = "";

  if (!state.sessions.length) {
    els.recentEmpty.classList.remove("hidden");
  } else {
    els.recentEmpty.classList.add("hidden");
  }

  const recent = state.sessions.slice(0, 6);
  for (const s of recent) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `recent-item${s.id === state.selectedId ? " active" : ""}`;
    btn.innerHTML = `<span class="name"></span><span class="sub"></span>`;
    btn.querySelector(".name").textContent = s.applicationName;
    const sub = btn.querySelector(".sub");
    const pages = `${s.statistics.pages} pages`;
    const date = formatDate(s.createdAt);
    sub.innerHTML =
      s.status === "completed"
        ? `<span class="check">✓</span><span></span>`
        : `<span></span>`;
    sub.querySelector("span:last-child").textContent = `${date} · ${pages}`;
    btn.addEventListener("click", () => selectSession(s.id));
    els.recentList.appendChild(btn);
  }

  for (const s of state.sessions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `all-session-item${s.id === state.selectedId ? " active" : ""}`;
    btn.innerHTML = `<span class="folder">${ICONS.folder}</span><span class="info"><span class="name"></span><span class="sub"></span></span>`;
    btn.querySelector(".name").textContent = s.applicationName;
    btn.querySelector(".sub").textContent = `${statusLabel(s.status)} · ${s.statistics.pages} pages`;
    btn.addEventListener("click", () => selectSession(s.id));
    els.allSessionList.appendChild(btn);
  }
}

function renderActiveSessionCard() {
  const live = state.sessions.find((s) => isLive(s.status));
  if (!live) {
    els.activeSessionCard.classList.add("hidden");
    stopDurationTimer();
    return;
  }
  els.activeSessionCard.classList.remove("hidden");
  els.activeSessionName.textContent = live.applicationName;
  els.activeSessionStatus.textContent =
    live.status === "initializing" ? "Initializing browser…" : "Exploration in progress…";
  els.activeSessionStarted.textContent = formatTime(live.startedAt || live.createdAt);
  els.activeSessionDuration.textContent = formatDuration(live.startedAt || live.createdAt);
  els.btnViewActive.onclick = () => selectSession(live.id);
  startDurationTimer(live);
}

function startDurationTimer(session) {
  stopDurationTimer();
  state.durationTimer = window.setInterval(() => {
    const current = state.sessions.find((s) => s.id === session.id);
    if (!current || !isLive(current.status)) {
      stopDurationTimer();
      renderActiveSessionCard();
      return;
    }
    els.activeSessionDuration.textContent = formatDuration(
      current.startedAt || current.createdAt,
    );
  }, 1000);
}

function stopDurationTimer() {
  if (state.durationTimer != null) {
    clearInterval(state.durationTimer);
    state.durationTimer = null;
  }
}

function renderTimeline(events) {
  const nearBottom =
    els.canvasScroll.scrollHeight -
      els.canvasScroll.scrollTop -
      els.canvasScroll.clientHeight <
    80;

  els.timeline.innerHTML = "";
  if (!events.length) {
    els.canvasEmpty.classList.remove("hidden");
  } else {
    els.canvasEmpty.classList.add("hidden");
  }

  for (const ev of events) {
    const badge = badgeForEvent(ev);
    const li = document.createElement("li");
    li.className = "event-item";
    li.innerHTML = `
      <div class="event-time"></div>
      <div class="event-rail"><span class="event-icon ${ev.status}"></span></div>
      <div class="event-body"><p class="title"></p></div>
      <div class="event-meta"><span class="badge ${badge.cls}"></span></div>
    `;
    li.querySelector(".event-time").textContent = formatTime(ev.timestamp);
    li.querySelector(".event-icon").innerHTML = iconForEvent(ev);
    li.querySelector(".title").textContent = ev.title;
    if (ev.description) {
      const desc = document.createElement("p");
      desc.className = "desc";
      desc.textContent = ev.description;
      li.querySelector(".event-body").appendChild(desc);
    }
    li.querySelector(".badge").textContent = badge.text;
    els.timeline.appendChild(li);
  }

  if (state.autoScroll && (nearBottom || events.length <= 4)) {
    requestAnimationFrame(() => {
      els.canvasScroll.scrollTop = els.canvasScroll.scrollHeight;
    });
  }
}

function renderStats(session) {
  const s = session?.statistics || { pages: 0, elements: 0, actions: 0, flows: 0 };
  els.statPages.textContent = String(s.pages);
  els.statElements.textContent = String(s.elements);
  els.statActions.textContent = String(s.actions);
  els.statFlows.textContent = String(s.flows);

  els.ovPages.textContent = String(s.pages);
  els.ovElements.textContent = String(s.elements);
  els.ovActions.textContent = String(s.actions);
  els.ovFlows.textContent = String(s.flows);

  if (!session) {
    els.progressLabel.textContent = "Waiting to start";
    els.liveBadge.classList.add("hidden");
    els.progressTrack.hidden = true;
    els.progressPct.textContent = "";
    els.failedBanner.classList.add("hidden");
    return;
  }

  if (isLive(session.status)) {
    els.progressLabel.textContent =
      session.status === "initializing" ? "Initializing browser…" : "Exploration in progress";
    els.liveBadge.classList.remove("hidden");
    els.progressTrack.hidden = true;
    els.progressPct.textContent = "";
  } else if (session.status === "completed") {
    els.progressLabel.textContent = "Exploration Completed";
    els.liveBadge.classList.add("hidden");
    els.progressTrack.hidden = false;
    els.progressFill.style.width = "100%";
    els.progressPct.textContent = "100%";
  } else if (session.status === "failed") {
    els.progressLabel.textContent = "Exploration Failed";
    els.liveBadge.classList.add("hidden");
    els.progressTrack.hidden = true;
    els.progressPct.textContent = "";
  } else {
    els.progressLabel.textContent = statusLabel(session.status);
    els.liveBadge.classList.add("hidden");
  }

  if (session.status === "failed") {
    els.failedBanner.classList.remove("hidden");
    els.failedReason.textContent = session.error || "Unknown error";
  } else {
    els.failedBanner.classList.add("hidden");
  }
}

function renderContext(session, documents) {
  if (!session) {
    els.contextName.textContent = "No session selected";
    els.contextUrl.textContent = "Select or start a session";
    els.contextStatusPill.textContent = "—";
    els.contextStatusPill.className = "status-pill";
    els.contextStarted.textContent = "—";
    els.docList.innerHTML = "";
    els.docsEmpty.classList.remove("hidden");
    els.btnDownloadAll.disabled = true;
    els.btnRemoveContext.disabled = true;
    els.btnDeleteSession.disabled = true;
    els.ovStatus.textContent = "—";
    els.ovStarted.textContent = "—";
    els.ovCompleted.textContent = "—";
    els.ovId.textContent = "—";
    return;
  }

  els.contextName.textContent = session.applicationName;
  els.contextUrl.textContent = session.applicationUrl;
  els.contextStatusPill.textContent = statusLabel(session.status);
  els.contextStatusPill.className = `status-pill${
    isLive(session.status) ? " live" : session.status === "completed" ? " completed" : session.status === "failed" ? " failed" : ""
  }`;
  els.contextStarted.textContent = `Started ${formatDate(session.startedAt || session.createdAt)}`;

  const availableCount = documents.filter((d) => d.available).length;
  const live = isLive(session.status);
  els.btnDownloadAll.disabled = availableCount === 0;
  els.btnRemoveContext.disabled = availableCount === 0 || live;
  els.btnDeleteSession.disabled = live;
  els.docsEmpty.classList.toggle("hidden", availableCount > 0);

  els.ovStatus.textContent = statusLabel(session.status);
  els.ovStarted.textContent = formatDate(session.startedAt || session.createdAt);
  els.ovCompleted.textContent = session.completedAt ? formatDate(session.completedAt) : "—";
  els.ovId.textContent = session.id;

  els.docList.innerHTML = "";
  for (const doc of documents) {
    const li = document.createElement("li");
    li.className = `doc-row${doc.available ? "" : " unavailable"}`;
    const ext = doc.name.endsWith(".json") ? "JSON" : "MD";
    li.innerHTML = `
      <span class="doc-file-icon ${doc.kind === "json" ? "json" : ""}">${ext}</span>
      <div class="doc-row-info"><span class="doc-name"></span><span class="doc-label"></span></div>
      <div class="doc-actions"></div>
    `;
    li.querySelector(".doc-name").textContent = doc.name;
    li.querySelector(".doc-label").textContent = doc.label;
    const actions = li.querySelector(".doc-actions");

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "icon-btn";
    viewBtn.title = "View";
    viewBtn.innerHTML = ICONS.view;
    viewBtn.disabled = !doc.available;
    viewBtn.addEventListener("click", () => openDocument(session.id, doc.name));

    const downloadLink = document.createElement("a");
    downloadLink.className = "icon-btn";
    downloadLink.title = "Download";
    downloadLink.innerHTML = ICONS.download;
    if (doc.available) {
      downloadLink.href = `/api/sessions/${encodeURIComponent(session.id)}/documents/${encodeURIComponent(doc.name)}?download=1`;
      downloadLink.download = doc.name;
    } else {
      downloadLink.addEventListener("click", (e) => e.preventDefault());
      downloadLink.style.pointerEvents = "none";
      downloadLink.style.opacity = "0.35";
    }

    actions.append(viewBtn, downloadLink);
    els.docList.appendChild(li);
  }
}

function renderSessionDetail(session) {
  renderStats(session);
  renderTimeline(state.events);
  renderContext(session, state.documents);
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
  const text = await res.text();
  els.docModalTitle.textContent = name;
  els.docContent.textContent = text;
  els.docCopy.textContent = "Copy";
  els.docModal.classList.remove("hidden");
  els.docClose.focus();
}

function closeDocument() {
  els.docModal.classList.add("hidden");
  els.docContent.textContent = "";
}

async function copyDocument() {
  try {
    await navigator.clipboard.writeText(els.docContent.textContent || "");
    els.docCopy.textContent = "Copied";
    setTimeout(() => {
      els.docCopy.textContent = "Copy";
    }, 1500);
  } catch {
    alert("Could not copy to clipboard");
  }
}

function closeSse() {
  if (state.sse) {
    state.sse.close();
    state.sse = null;
  }
}

function connectSse(sessionId) {
  closeSse();
  const es = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events/stream`);
  state.sse = es;

  es.addEventListener("snapshot", (msg) => {
    const data = JSON.parse(msg.data);
    if (data.session) upsertSession(data.session);
    state.events = data.events || [];
    renderTimeline(state.events);
    if (data.session) renderStats(data.session);
    void refreshDocuments(sessionId);
  });

  es.addEventListener("event", (msg) => {
    const event = JSON.parse(msg.data);
    if (event.sessionId !== state.selectedId) return;
    if (!state.events.some((e) => e.id === event.id)) {
      state.events.push(event);
      renderTimeline(state.events);
    }
  });

  es.addEventListener("session", (msg) => {
    const session = JSON.parse(msg.data);
    upsertSession(session);
    if (session.id === state.selectedId) {
      renderStats(session);
      if (session.status === "completed" || session.status === "failed") {
        void refreshDocuments(session.id);
      }
    }
  });
}

async function refreshDocuments(sessionId) {
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(sessionId)}/documents`);
    state.documents = data.documents || [];
    const session = selectedSession();
    if (session) renderContext(session, state.documents);
  } catch {
    /* ignore */
  }
}

async function selectSession(sessionId) {
  state.selectedId = sessionId;
  closeMenu();
  closeDocument();
  renderSessionLists();

  try {
    const [{ session }, { events }, { documents }] = await Promise.all([
      api(`/api/sessions/${encodeURIComponent(sessionId)}`),
      api(`/api/sessions/${encodeURIComponent(sessionId)}/events`),
      api(`/api/sessions/${encodeURIComponent(sessionId)}/documents`),
    ]);
    upsertSession(session);
    state.events = events || [];
    state.documents = documents || [];
    renderSessionDetail(session);
    connectSse(sessionId);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
}

async function loadSessions() {
  const data = await api("/api/sessions");
  state.sessions = data.sessions || [];
  renderSessionLists();
  renderActiveSessionCard();
  renderStats(null);
  renderContext(null, []);
  if (!state.sessions.length) return;
  const prefer = state.sessions.find((s) => isLive(s.status)) || state.sessions[0];
  await selectSession(prefer.id);
}

function closeMenu() {
  els.sessionMenu.classList.add("hidden");
  els.btnSessionMenu.setAttribute("aria-expanded", "false");
}

function setTab(tab) {
  const docs = tab === "documents";
  els.tabDocuments.classList.toggle("active", docs);
  els.tabOverview.classList.toggle("active", !docs);
  els.panelDocuments.classList.toggle("hidden", !docs);
  els.panelOverview.classList.toggle("hidden", docs);
}

els.startForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.formError.classList.add("hidden");
  const url = els.inputUrl.value.trim();
  if (!url) {
    els.formError.textContent = "Application URL is required.";
    els.formError.classList.remove("hidden");
    return;
  }

  els.btnStart.disabled = true;
  els.btnStart.textContent = "Starting…";
  try {
    const body = {
      url,
      username: els.inputUsername.value.trim() || undefined,
      password: els.inputPassword.value || undefined,
      maxPages: Number(els.inputMaxPages.value) || undefined,
      maxDurationMs: Number(els.inputMaxDuration.value) || undefined,
    };
    const { session } = await api("/api/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    });
    els.inputPassword.value = "";
    upsertSession(session);
    await selectSession(session.id);
  } catch (err) {
    els.formError.textContent = err instanceof Error ? err.message : String(err);
    els.formError.classList.remove("hidden");
  } finally {
    els.btnStart.disabled = false;
    els.btnStart.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Start Exploring';
  }
});

els.btnTogglePassword.addEventListener("click", () => {
  const show = els.inputPassword.type === "password";
  els.inputPassword.type = show ? "text" : "password";
  els.btnTogglePassword.title = show ? "Hide password" : "Show password";
});

els.btnNewSession.addEventListener("click", focusStartForm);
els.btnViewAll.addEventListener("click", () => {
  els.allSessionList.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

els.toggleAutoscroll.addEventListener("change", () => {
  state.autoScroll = els.toggleAutoscroll.checked;
});

els.btnClearCanvas.addEventListener("click", () => {
  // Visual clear only — persisted events remain for the session
  els.timeline.innerHTML = "";
  els.canvasEmpty.classList.remove("hidden");
});

els.btnSessionMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = els.sessionMenu.classList.contains("hidden");
  els.sessionMenu.classList.toggle("hidden", !open);
  els.btnSessionMenu.setAttribute("aria-expanded", open ? "true" : "false");
});

document.addEventListener("click", (e) => {
  if (!els.sessionMenu.contains(/** @type {Node} */ (e.target)) && e.target !== els.btnSessionMenu) {
    closeMenu();
  }
});

els.tabDocuments.addEventListener("click", () => setTab("documents"));
els.tabOverview.addEventListener("click", () => setTab("overview"));

els.btnDownloadAll.addEventListener("click", () => {
  closeMenu();
  if (!state.selectedId || els.btnDownloadAll.disabled) return;
  const a = document.createElement("a");
  a.href = `/api/sessions/${encodeURIComponent(state.selectedId)}/documents/download-all`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

els.btnRemoveContext.addEventListener("click", async () => {
  closeMenu();
  if (!state.selectedId || els.btnRemoveContext.disabled) return;
  if (
    !window.confirm(
      "Remove all generated application-context documents for this session? Exploration events will be kept.",
    )
  ) {
    return;
  }
  try {
    await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/context`, {
      method: "DELETE",
    });
    closeDocument();
    await refreshDocuments(state.selectedId);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
});

els.btnDeleteSession.addEventListener("click", async () => {
  closeMenu();
  const sessionId = state.selectedId;
  if (!sessionId || els.btnDeleteSession.disabled) return;
  const session = selectedSession();
  if (
    !window.confirm(
      `Delete session "${session?.applicationName || sessionId}" permanently? This removes events, memory, and application context.`,
    )
  ) {
    return;
  }
  try {
    await api(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    closeDocument();
    closeSse();
    state.sessions = state.sessions.filter((s) => s.id !== sessionId);
    state.events = [];
    state.documents = [];
    state.selectedId = null;
    renderSessionLists();
    renderActiveSessionCard();
    if (state.sessions.length) {
      await selectSession(state.sessions[0].id);
    } else {
      renderStats(null);
      renderContext(null, []);
      renderTimeline([]);
    }
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
});

els.btnRetry.addEventListener("click", async () => {
  const session = selectedSession();
  if (!session) return;
  const password = session.username
    ? window.prompt("Password (not stored; required only if the app needs login):") ?? undefined
    : undefined;
  try {
    const { session: next } = await api(
      `/api/sessions/${encodeURIComponent(session.id)}/retry`,
      {
        method: "POST",
        body: JSON.stringify({ password: password || undefined }),
      },
    );
    upsertSession(next);
    await selectSession(next.id);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
});

els.docClose.addEventListener("click", closeDocument);
els.docCopy.addEventListener("click", () => void copyDocument());
els.docModal.addEventListener("click", (e) => {
  if (e.target === els.docModal) closeDocument();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.docModal.classList.contains("hidden")) closeDocument();
});

els.btnHelp.addEventListener("click", () => {
  alert(
    "Enter an application URL (optional credentials), then Start Exploring.\n\nWatch live activity in the canvas. Generated documents appear in Application Context when exploration finishes.",
  );
});

loadSessions().catch((err) => {
  console.error(err);
  els.formError.textContent = "Could not load sessions. Is the server running?";
  els.formError.classList.remove("hidden");
});
