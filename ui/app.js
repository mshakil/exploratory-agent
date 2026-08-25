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

const FRAMEWORK_OPTIONS = [
  { value: "independent", label: "Framework Independent", enabled: true },
  { value: "playwright", label: "Playwright", enabled: true },
  { value: "selenium-java", label: "Selenium Java", enabled: true },
  { value: "selenium-javascript", label: "Selenium JavaScript", enabled: false },
  { value: "cypress", label: "Cypress", enabled: false },
  { value: "webdriverio", label: "WebdriverIO", enabled: false },
];

const FRAMEWORK_ICONS = {
  independent: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  playwright: `<svg viewBox="0 0 24 24"><path d="M4 7.5L12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  "selenium-java": `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4"/></svg>`,
  "selenium-javascript": `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4"/></svg>`,
  cypress: `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 100 18 9 9 0 000-18z"/><path d="M8.5 12.5l2.2 2.2L15.5 10"/></svg>`,
  webdriverio: `<svg viewBox="0 0 24 24"><path d="M4 16V8l8-4 8 4v8l-8 4-8-4z"/><path d="M12 8v8M8 10l4 2 4-2"/></svg>`,
};

const state = {
  sessions: /** @type {ExplorationSession[]} */ ([]),
  selectedId: /** @type {string | null} */ (null),
  events: /** @type {ExplorationEvent[]} */ ([]),
  documents: /** @type {Array<{name:string;label:string;kind:string;description?:string;available:boolean;size?:number}>} */ ([]),
  graph: /** @type {{ pages: Array<Record<string, unknown>>; transitions: Array<Record<string, unknown>> } | null} */ (null),
  graphZoom: 1,
  centerTab: "live",
  sse: /** @type {EventSource | null} */ (null),
  autoScroll: true,
  durationTimer: /** @type {number | null} */ (null),
};

const $ = (id) => document.getElementById(id);

const els = {
  startForm: /** @type {HTMLFormElement} */ ($("start-form")),
  inputUrl: /** @type {HTMLInputElement} */ ($("input-url")),
  inputUsername: /** @type {HTMLInputElement} */ ($("input-username")),
  inputPassword: /** @type {HTMLInputElement} */ ($("input-password")),
  inputFramework: /** @type {HTMLInputElement} */ ($("input-framework")),
  fwPicker: /** @type {HTMLElement} */ ($("fw-picker")),
  fwTrigger: /** @type {HTMLButtonElement} */ ($("fw-trigger")),
  fwTriggerIcon: /** @type {HTMLElement} */ ($("fw-trigger-icon")),
  fwTriggerLabel: /** @type {HTMLElement} */ ($("fw-trigger-label")),
  fwMenu: /** @type {HTMLElement} */ ($("fw-menu")),
  inputMaxPages: /** @type {HTMLInputElement} */ ($("input-max-pages")),
  inputMaxDuration: /** @type {HTMLInputElement} */ ($("input-max-duration")),
  formError: /** @type {HTMLElement} */ ($("form-error")),
  btnStart: /** @type {HTMLButtonElement} */ ($("btn-start")),
  btnTogglePassword: /** @type {HTMLButtonElement} */ ($("btn-toggle-password")),
  sessionList: /** @type {HTMLElement} */ ($("session-list")),
  sessionsEmpty: /** @type {HTMLElement} */ ($("sessions-empty")),
  btnViewAll: /** @type {HTMLButtonElement} */ ($("btn-view-all")),
  canvasAppName: /** @type {HTMLElement} */ ($("canvas-app-name")),
  canvasAppUrl: /** @type {HTMLElement} */ ($("canvas-app-url")),
  canvasStatusPill: /** @type {HTMLElement} */ ($("canvas-status-pill")),
  canvasFwPill: /** @type {HTMLElement} */ ($("canvas-fw-pill")),
  btnPause: /** @type {HTMLButtonElement} */ ($("btn-pause")),
  btnStop: /** @type {HTMLButtonElement} */ ($("btn-stop")),
  liveBadge: /** @type {HTMLElement} */ ($("live-badge")),
  toggleAutoscroll: /** @type {HTMLInputElement} */ ($("toggle-autoscroll")),
  btnClearCanvas: /** @type {HTMLButtonElement} */ ($("btn-clear-canvas")),
  progressLabel: /** @type {HTMLElement} */ ($("progress-label")),
  progressPct: /** @type {HTMLElement} */ ($("progress-pct")),
  progressTrack: /** @type {HTMLElement} */ ($("progress-track")),
  progressFill: /** @type {HTMLElement} */ ($("progress-fill")),
  statPages: /** @type {HTMLElement} */ ($("stat-pages")),
  statElements: /** @type {HTMLElement} */ ($("stat-elements")),
  statActions: /** @type {HTMLElement} */ ($("stat-actions")),
  statFlows: /** @type {HTMLElement} */ ($("stat-flows")),
  statEta: /** @type {HTMLElement} */ ($("stat-eta")),
  timeline: /** @type {HTMLOListElement} */ ($("event-timeline")),
  canvasEmpty: /** @type {HTMLElement} */ ($("canvas-empty")),
  canvasScroll: /** @type {HTMLElement} */ ($("canvas-scroll")),
  failedBanner: /** @type {HTMLElement} */ ($("failed-banner")),
  failedReason: /** @type {HTMLElement} */ ($("failed-reason")),
  btnRetry: /** @type {HTMLButtonElement} */ ($("btn-retry")),
  contextName: /** @type {HTMLElement} */ ($("context-name")),
  contextUrl: /** @type {HTMLElement} */ ($("context-url")),
  contextStatusPill: /** @type {HTMLElement} */ ($("context-status-pill")),
  contextMeta: /** @type {HTMLElement} */ ($("context-meta")),
  contextFwPill: /** @type {HTMLElement} */ ($("context-fw-pill")),
  btnResume: /** @type {HTMLButtonElement} */ ($("btn-resume")),
  btnSessionMenu: /** @type {HTMLButtonElement} */ ($("btn-session-menu")),
  sessionMenu: /** @type {HTMLElement} */ ($("session-menu")),
  docList: /** @type {HTMLElement} */ ($("doc-list")),
  docsEmpty: /** @type {HTMLElement} */ ($("docs-empty")),
  btnDownloadAll: /** @type {HTMLButtonElement} */ ($("btn-download-all")),
  btnDownloadZip: /** @type {HTMLButtonElement} */ ($("btn-download-zip")),
  btnRemoveContext: /** @type {HTMLButtonElement} */ ($("btn-remove-context")),
  btnDeleteSession: /** @type {HTMLButtonElement} */ ($("btn-delete-session")),
  changeGrid: /** @type {HTMLElement} */ ($("change-grid")),
  changesEmpty: /** @type {HTMLElement} */ ($("changes-empty")),
  changeMiniGrid: /** @type {HTMLElement} */ ($("change-mini-grid")),
  rightChangesEmpty: /** @type {HTMLElement} */ ($("right-changes-empty")),
  ovPages: /** @type {HTMLElement} */ ($("ov-pages")),
  ovElements: /** @type {HTMLElement} */ ($("ov-elements")),
  ovActions: /** @type {HTMLElement} */ ($("ov-actions")),
  ovFlows: /** @type {HTMLElement} */ ($("ov-flows")),
  ovStatus: /** @type {HTMLElement} */ ($("ov-status")),
  ovFramework: /** @type {HTMLElement} */ ($("ov-framework")),
  ovStarted: /** @type {HTMLElement} */ ($("ov-started")),
  ovCompleted: /** @type {HTMLElement} */ ($("ov-completed")),
  ovId: /** @type {HTMLElement} */ ($("ov-id")),
  setUrl: /** @type {HTMLElement} */ ($("set-url")),
  setUser: /** @type {HTMLElement} */ ($("set-user")),
  setFw: /** @type {HTMLElement} */ ($("set-fw")),
  graphNodeCount: /** @type {HTMLElement} */ ($("graph-node-count")),
  graphEdgeCount: /** @type {HTMLElement} */ ($("graph-edge-count")),
  graphEmpty: /** @type {HTMLElement} */ ($("graph-empty")),
  graphSvg: /** @type {SVGSVGElement} */ ($("graph-svg")),
  graphViewport: /** @type {HTMLElement} */ ($("graph-viewport")),
  graphDetail: /** @type {HTMLElement} */ ($("graph-detail")),
  graphDetailTitle: /** @type {HTMLElement} */ ($("graph-detail-title")),
  graphDetailStatus: /** @type {HTMLElement} */ ($("graph-detail-status")),
  graphDetailUrl: /** @type {HTMLElement} */ ($("graph-detail-url")),
  graphDetailMeta: /** @type {HTMLElement} */ ($("graph-detail-meta")),
  graphZoomPct: /** @type {HTMLElement} */ ($("graph-zoom-pct")),
  btnGraphZoomIn: /** @type {HTMLButtonElement} */ ($("btn-graph-zoom-in")),
  btnGraphZoomOut: /** @type {HTMLButtonElement} */ ($("btn-graph-zoom-out")),
  btnGraphZoomReset: /** @type {HTMLButtonElement} */ ($("btn-graph-zoom-reset")),
  btnGraphRefresh: /** @type {HTMLButtonElement} */ ($("btn-graph-refresh")),
  docModal: /** @type {HTMLElement} */ ($("doc-modal")),
  docModalTitle: /** @type {HTMLElement} */ ($("doc-modal-title")),
  docContent: /** @type {HTMLElement} */ ($("doc-content")),
  docCopy: /** @type {HTMLButtonElement} */ ($("doc-copy")),
  docClose: /** @type {HTMLButtonElement} */ ($("doc-close")),
  btnHelp: /** @type {HTMLButtonElement} */ ($("btn-help")),
  btnTheme: /** @type {HTMLButtonElement} */ ($("btn-theme")),
  helpModal: /** @type {HTMLElement} */ ($("help-modal")),
  helpClose: /** @type {HTMLButtonElement} */ ($("help-close")),
};

const ICONS = {
  view: `<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>`,
  browser: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>`,
  nav: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18"/></svg>`,
  page: `<svg viewBox="0 0 24 24"><path d="M8 3h6l5 5v13a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/></svg>`,
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  click: `<svg viewBox="0 0 24 24"><path d="M9 3v11l3-2 2 5 2-1-2-5 4-1L9 3z"/></svg>`,
  flow: `<svg viewBox="0 0 24 24"><path d="M6 3v6M18 15v6M6 9a3 3 0 100 6 3 3 0 000-6zM18 9a3 3 0 100 6 3 3 0 000-6zM9 12h6"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`,
  fail: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  change: `<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0114.9-4M20 12a8 8 0 01-14.9 4M16 4v4h4M8 20v-4H4"/></svg>`,
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

function formatBytes(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
  if (status === "re-exploring") return "Re-exploring";
  if (status === "exploring" || status === "initializing") return "Active";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "paused") return "Paused";
  return status;
}

function frameworkLabel(fw) {
  return FRAMEWORK_LABELS[fw] || fw || "Framework Independent";
}

function frameworkIconHtml(fw) {
  const svg = FRAMEWORK_ICONS[fw] || FRAMEWORK_ICONS.independent;
  return `<span class="fw-icon fw-${fw}">${svg}</span>`;
}

function setFrameworkValue(value) {
  const opt = FRAMEWORK_OPTIONS.find((o) => o.value === value) || FRAMEWORK_OPTIONS[0];
  els.inputFramework.value = opt.value;
  els.fwTriggerLabel.textContent = opt.label;
  els.fwTriggerIcon.className = `fw-icon fw-${opt.value}`;
  els.fwTriggerIcon.innerHTML = FRAMEWORK_ICONS[opt.value] || FRAMEWORK_ICONS.independent;
  for (const btn of els.fwMenu.querySelectorAll(".fw-option")) {
    btn.setAttribute("aria-selected", btn.dataset.value === opt.value ? "true" : "false");
  }
}

function closeFrameworkMenu() {
  els.fwPicker.classList.remove("open");
  els.fwMenu.classList.add("hidden");
  els.fwTrigger.setAttribute("aria-expanded", "false");
}

function openFrameworkMenu() {
  els.fwPicker.classList.add("open");
  els.fwMenu.classList.remove("hidden");
  els.fwTrigger.setAttribute("aria-expanded", "true");
}

function toggleFrameworkMenu() {
  if (els.fwMenu.classList.contains("hidden")) openFrameworkMenu();
  else closeFrameworkMenu();
}

function initFrameworkPicker() {
  els.fwMenu.innerHTML = "";
  for (const opt of FRAMEWORK_OPTIONS) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fw-option";
    btn.setAttribute("role", "option");
    btn.dataset.value = opt.value;
    btn.disabled = !opt.enabled;
    btn.setAttribute("aria-selected", opt.value === els.inputFramework.value ? "true" : "false");
    const label = document.createElement("span");
    label.textContent = opt.label;
    btn.innerHTML = frameworkIconHtml(opt.value);
    btn.appendChild(label);
    if (!opt.enabled) {
      const soon = document.createElement("span");
      soon.className = "fw-soon";
      soon.textContent = "Soon";
      btn.appendChild(soon);
    }
    btn.addEventListener("click", () => {
      if (!opt.enabled) return;
      setFrameworkValue(opt.value);
      closeFrameworkMenu();
    });
    li.appendChild(btn);
    els.fwMenu.appendChild(li);
  }
  setFrameworkValue(els.inputFramework.value || "independent");
  els.fwTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFrameworkMenu();
  });
  document.addEventListener("click", (e) => {
    if (!els.fwPicker.contains(/** @type {Node} */ (e.target))) closeFrameworkMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFrameworkMenu();
  });
}

function estimateProgress(session) {
  if (!session) return 0;
  if (session.status === "completed") return 100;
  if (session.status === "failed") return 0;
  const pages = session.statistics?.pages || 0;
  // Soft estimate against default max pages of 50
  return Math.min(95, Math.round((pages / 50) * 100));
}

function badgeForEvent(ev) {
  if (ev.status === "new") return { text: "New", cls: "new" };
  if (ev.status === "removed") return { text: "Removed", cls: "removed" };
  if (ev.status === "changed") return { text: "Changed", cls: "changed" };
  if (ev.status === "existing") return { text: "Existing", cls: "existing" };
  if (ev.type === "elements_discovered") {
    const count = ev.metadata?.count;
    return { text: count != null ? `${count} elements` : "Elements", cls: "info" };
  }
  if (ev.type === "page_discovered") return { text: "New Page", cls: "info" };
  if (ev.type === "flow_discovered") return { text: "Flow", cls: "info" };
  if (ev.type === "change_detected") return { text: "Change", cls: "changed" };
  if (ev.status === "success") return { text: "Success", cls: "success" };
  if (ev.status === "failed") return { text: "Failed", cls: "failed" };
  if (ev.status === "skipped") return { text: "Skipped", cls: "skipped" };
  return { text: "In Progress", cls: "running" };
}

function iconForEvent(ev) {
  if (ev.type === "change_detected" || ev.type === "knowledge_loaded") return ICONS.change;
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
}

function renderSessionLists() {
  els.sessionList.innerHTML = "";
  els.sessionsEmpty.classList.toggle("hidden", state.sessions.length > 0);

  for (const s of state.sessions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `session-item${s.id === state.selectedId ? " active" : ""}`;
    const pct = estimateProgress(s);
    const live = isLive(s.status);
    btn.innerHTML = `
      <div class="session-item-top">
        <p class="session-item-name"></p>
        <span class="status-pill ${live ? "live" : s.status}"></span>
      </div>
      <p class="session-item-url"></p>
      <div class="session-item-stats"></div>
      ${live ? `<div class="session-item-progress"><span style="width:${pct}%"></span></div>` : ""}
    `;
    btn.querySelector(".session-item-name").textContent = s.applicationName;
    btn.querySelector(".status-pill").textContent = statusLabel(s.status);
    btn.querySelector(".session-item-url").textContent = s.applicationUrl;
    btn.querySelector(".session-item-stats").textContent =
      `${s.statistics.pages} pages · ${s.statistics.elements} elements · ${s.statistics.flows} flows`;
    btn.addEventListener("click", () => selectSession(s.id));
    els.sessionList.appendChild(btn);
  }
}

function renderTimeline(events) {
  const nearBottom =
    els.canvasScroll.scrollHeight -
      els.canvasScroll.scrollTop -
      els.canvasScroll.clientHeight <
    80;

  els.timeline.innerHTML = "";
  els.canvasEmpty.classList.toggle("hidden", events.length > 0);

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

function renderChanges(session) {
  const c = session?.latestChanges;
  const chips = [];
  if (c) {
    if (c.pagesAdded) chips.push({ cls: "add", text: `+ ${c.pagesAdded}`, sub: "New Pages" });
    if (c.pagesRemoved) chips.push({ cls: "remove", text: `− ${c.pagesRemoved}`, sub: "Removed Pages" });
    if (c.elementsAdded) chips.push({ cls: "add", text: `+ ${c.elementsAdded}`, sub: "New Elements" });
    if (c.elementsRemoved) chips.push({ cls: "remove", text: `− ${c.elementsRemoved}`, sub: "Removed Elements" });
    if (c.selectorsChanged) chips.push({ cls: "change", text: `~ ${c.selectorsChanged}`, sub: "Changed Selectors" });
    if (c.flowsAdded) chips.push({ cls: "add", text: `+ ${c.flowsAdded}`, sub: "New Flows" });
    if (c.flowsChanged) chips.push({ cls: "change", text: `~ ${c.flowsChanged}`, sub: "Changed Flows" });
  }

  const has = chips.length > 0;
  els.changesEmpty.classList.toggle("hidden", has);
  els.changeGrid.classList.toggle("hidden", !has);
  els.rightChangesEmpty.classList.toggle("hidden", has);
  els.changeMiniGrid.classList.toggle("hidden", !has);

  const renderInto = (el) => {
    el.innerHTML = "";
    for (const chip of chips) {
      const div = document.createElement("div");
      div.className = `change-chip ${chip.cls}`;
      div.innerHTML = `<span></span><small></small>`;
      div.querySelector("span").textContent = chip.text;
      div.querySelector("small").textContent = chip.sub;
      el.appendChild(div);
    }
  };
  renderInto(els.changeGrid);
  renderInto(els.changeMiniGrid);
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
    els.statEta.textContent = "—";
    els.failedBanner.classList.add("hidden");
    els.btnPause.classList.add("hidden");
    els.btnStop.classList.add("hidden");
    return;
  }

  const live = isLive(session.status);
  const pct = estimateProgress(session);

  if (live) {
    els.progressLabel.textContent =
      session.status === "re-exploring"
        ? "Re-exploring application…"
        : session.status === "initializing"
          ? "Initializing browser…"
          : "Exploration in progress";
    els.liveBadge.classList.remove("hidden");
    els.progressTrack.hidden = false;
    els.progressFill.style.width = `${pct}%`;
    els.progressPct.textContent = `${pct}%`;
    els.statEta.textContent = formatDuration(session.startedAt || session.createdAt);
    els.btnPause.classList.remove("hidden");
    els.btnStop.classList.remove("hidden");
  } else if (session.status === "completed") {
    els.progressLabel.textContent = "Exploration Completed";
    els.liveBadge.classList.add("hidden");
    els.progressTrack.hidden = false;
    els.progressFill.style.width = "100%";
    els.progressPct.textContent = "100%";
    els.statEta.textContent = "00:00:00";
    els.btnPause.classList.add("hidden");
    els.btnStop.classList.add("hidden");
  } else if (session.status === "failed") {
    els.progressLabel.textContent = "Exploration Failed";
    els.liveBadge.classList.add("hidden");
    els.progressTrack.hidden = true;
    els.progressPct.textContent = "";
    els.statEta.textContent = "—";
    els.btnPause.classList.add("hidden");
    els.btnStop.classList.add("hidden");
  } else {
    els.progressLabel.textContent = statusLabel(session.status);
    els.liveBadge.classList.add("hidden");
    els.btnPause.classList.add("hidden");
    els.btnStop.classList.add("hidden");
  }

  els.failedBanner.classList.toggle("hidden", session.status !== "failed");
  if (session.status === "failed") {
    els.failedReason.textContent = session.error || "Unknown error";
  }
}

function renderHeader(session) {
  if (!session) {
    els.canvasAppName.textContent = "Select a session";
    els.canvasAppUrl.textContent = "Start a new exploration or pick a session";
    els.canvasStatusPill.textContent = "—";
    els.canvasStatusPill.className = "status-pill";
    els.canvasFwPill.classList.add("hidden");
    return;
  }
  els.canvasAppName.textContent = session.applicationName;
  els.canvasAppUrl.textContent = session.applicationUrl;
  els.canvasStatusPill.textContent = statusLabel(session.status).toUpperCase();
  els.canvasStatusPill.className = `status-pill ${session.status}`;
  els.canvasFwPill.textContent = frameworkLabel(session.framework);
  els.canvasFwPill.classList.remove("hidden");
}

function renderContext(session, documents) {
  if (!session) {
    els.contextName.textContent = "No session selected";
    els.contextUrl.textContent = "Select or start a session";
    els.contextStatusPill.textContent = "—";
    els.contextStatusPill.className = "status-pill";
    els.contextMeta.textContent = "—";
    els.contextFwPill.textContent = "Framework Independent";
    els.btnResume.classList.add("hidden");
    els.docList.innerHTML = "";
    els.docsEmpty.classList.remove("hidden");
    els.btnDownloadAll.disabled = true;
    els.btnDownloadZip.disabled = true;
    els.btnRemoveContext.disabled = true;
    els.btnDeleteSession.disabled = true;
    els.ovStatus.textContent = "—";
    els.ovFramework.textContent = "—";
    els.ovStarted.textContent = "—";
    els.ovCompleted.textContent = "—";
    els.ovId.textContent = "—";
    els.setUrl.textContent = "—";
    els.setUser.textContent = "—";
    els.setFw.textContent = "—";
    return;
  }

  els.contextName.textContent = session.applicationName;
  els.contextUrl.textContent = session.applicationUrl;
  els.contextStatusPill.textContent = statusLabel(session.status);
  els.contextStatusPill.className = `status-pill ${
    isLive(session.status)
      ? "live"
      : session.status === "completed"
        ? "completed"
        : session.status === "failed"
          ? "failed"
          : ""
  }`;
  els.contextMeta.textContent = `Last explored ${formatDate(session.completedAt || session.updatedAt || session.createdAt)}`;
  els.contextFwPill.textContent = frameworkLabel(session.framework);

  const showResume = canResume(session.status);
  els.btnResume.classList.toggle("hidden", !showResume);

  const availableCount = documents.filter((d) => d.available).length;
  const live = isLive(session.status);
  els.btnDownloadAll.disabled = availableCount === 0;
  els.btnDownloadZip.disabled = availableCount === 0;
  els.btnRemoveContext.disabled = availableCount === 0 || live;
  els.btnDeleteSession.disabled = live;
  els.docsEmpty.classList.toggle("hidden", availableCount > 0);

  els.ovStatus.textContent = statusLabel(session.status);
  els.ovFramework.textContent = frameworkLabel(session.framework);
  els.ovStarted.textContent = formatDate(session.startedAt || session.createdAt);
  els.ovCompleted.textContent = session.completedAt ? formatDate(session.completedAt) : "—";
  els.ovId.textContent = session.id;
  els.setUrl.textContent = session.applicationUrl;
  els.setUser.textContent = session.username || "—";
  els.setFw.textContent = frameworkLabel(session.framework);

  els.docList.innerHTML = "";
  for (const doc of documents) {
    const li = document.createElement("li");
    li.className = `doc-row${doc.available ? "" : " unavailable"}`;
    const ext = doc.name.endsWith(".json") ? "JSON" : "MD";
    li.innerHTML = `
      <span class="doc-file-icon ${doc.kind === "json" ? "json" : ""}">${ext}</span>
      <div class="doc-row-info">
        <span class="doc-name"></span>
        <p class="doc-desc"></p>
        <span class="doc-size"></span>
      </div>
      <div class="doc-actions"></div>
    `;
    li.querySelector(".doc-name").textContent = doc.name;
    li.querySelector(".doc-desc").textContent = doc.description || doc.label;
    li.querySelector(".doc-size").textContent = formatBytes(doc.size);
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
      downloadLink.download = doc.name.split("/").pop() || doc.name;
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
  renderHeader(session);
  renderStats(session);
  renderTimeline(state.events);
  renderContext(session, state.documents);
  renderChanges(session);
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
    if (data.session) {
      renderStats(data.session);
      renderHeader(data.session);
      renderChanges(data.session);
    }
    void refreshDocuments(sessionId);
  });

  es.addEventListener("event", (msg) => {
    const event = JSON.parse(msg.data);
    if (event.sessionId !== state.selectedId) return;
    if (!state.events.some((e) => e.id === event.id)) {
      state.events.push(event);
      renderTimeline(state.events);
    }
    if (
      state.centerTab === "graph" &&
      (event.type === "page_discovered" || event.type === "action_completed")
    ) {
      void refreshGraph(state.selectedId);
    }
  });

  es.addEventListener("session", (msg) => {
    const session = JSON.parse(msg.data);
    upsertSession(session);
    if (session.id === state.selectedId) {
      renderStats(session);
      renderHeader(session);
      renderChanges(session);
      if (session.status === "completed" || session.status === "failed") {
        void refreshDocuments(session.id);
        void refreshGraph(session.id);
      } else if (state.centerTab === "graph" && isLive(session.status)) {
        void refreshGraph(session.id);
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
    void refreshGraph(sessionId);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
}

async function loadSessions() {
  const data = await api("/api/sessions");
  state.sessions = data.sessions || [];
  renderSessionLists();
  renderStats(null);
  renderContext(null, []);
  renderHeader(null);
  renderChanges(null);
  if (!state.sessions.length) return;
  const prefer = state.sessions.find((s) => isLive(s.status)) || state.sessions[0];
  await selectSession(prefer.id);
}

function closeMenu() {
  els.sessionMenu.classList.add("hidden");
  els.btnSessionMenu.setAttribute("aria-expanded", "false");
}

function setCenterTab(tab) {
  state.centerTab = tab;
  for (const id of ["live", "changes", "stats", "graph", "settings"]) {
    const btn = document.getElementById(`ctab-${id}`);
    const panel = document.getElementById(`panel-${id}`);
    btn?.classList.toggle("active", id === tab);
    panel?.classList.toggle("hidden", id !== tab);
  }
  if (tab === "graph") void refreshGraph(state.selectedId);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabel(text, max = 22) {
  const s = String(text || "").trim() || "Untitled";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function shortUrl(url) {
  try {
    const u = new URL(url, "http://local.invalid");
    const path = `${u.pathname}${u.hash}`;
    return path || "/";
  } catch {
    return String(url || "/");
  }
}

function humanizeSegment(seg) {
  const cleaned = String(seg || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!cleaned) return "Page";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Prefer a readable path-based label over repeated document titles. */
function pageDisplayName(page, pages) {
  const path = shortUrl(String(page.url || ""));
  const parts = path.split("/").filter(Boolean);
  let seg = parts[parts.length - 1] || "home";
  if (/^(index|default|home)(\.|$)/i.test(seg) && parts.length > 1) {
    seg = parts[parts.length - 2];
  }
  let label = humanizeSegment(seg);

  const samePath = (pages || []).filter((p) => shortUrl(String(p.url || "")) === path);
  if (samePath.length > 1) {
    const idx = samePath.findIndex((p) => p.id === page.id) + 1;
    label = `${label} · state ${idx}`;
  }

  return label;
}

function actionLabel(action) {
  const type = String(action?.type || "action");
  const el = String(action?.element || "").trim();
  if (!el) return type;
  return `${type} “${truncateLabel(el, 18)}”`;
}

function clearGraphDetail() {
  els.graphDetail.classList.add("hidden");
  els.graphDetailTitle.textContent = "—";
  els.graphDetailStatus.textContent = "—";
  els.graphDetailStatus.className = "status-pill";
  els.graphDetailUrl.textContent = "—";
  els.graphDetailMeta.textContent = "—";
}

function showGraphDetail(page, pages, transitions) {
  const label = pageDisplayName(page, pages);
  const status = String(page.status || "DISCOVERED");
  els.graphDetail.classList.remove("hidden");
  els.graphDetailTitle.textContent = label;
  els.graphDetailStatus.textContent = status;
  els.graphDetailStatus.className = `status-pill ${status.toLowerCase()}`;
  els.graphDetailUrl.textContent = String(page.url || "—");

  const inbound = transitions.filter((t) => t.to === page.id);
  const outbound = transitions.filter((t) => t.from === page.id);
  const reached =
    page.reachedBy?.action && page.reachedBy?.element
      ? `Reached by ${page.reachedBy.action} “${page.reachedBy.element}”`
      : inbound[0]
        ? `Reached by ${actionLabel(inbound[0].action)}`
        : "Start / root page";
  els.graphDetailMeta.textContent = `${reached} · ${outbound.length} outgoing · ${page.elementIds?.length ?? "?"} elements`;
}

/**
 * Layered left→right layout from transition DAG, then SVG render.
 * @param {{ pages: Array<Record<string, any>>; transitions: Array<Record<string, any>> }} graph
 */
function renderGraphView(graph) {
  const pages = graph?.pages || [];
  const transitions = graph?.transitions || [];
  els.graphNodeCount.textContent = `${pages.length} page${pages.length === 1 ? "" : "s"}`;
  els.graphEdgeCount.textContent = `${transitions.length} transition${transitions.length === 1 ? "" : "s"}`;

  if (!pages.length) {
    clearGraphDetail();
    els.graphEmpty.textContent = state.selectedId
      ? "No graph data yet. Explore a session to discover pages and transitions."
      : "Select a session to view its application graph.";
    els.graphEmpty.classList.remove("hidden");
    els.graphSvg.classList.add("hidden");
    els.graphSvg.innerHTML = "";
    return;
  }

  els.graphEmpty.classList.add("hidden");
  els.graphSvg.classList.remove("hidden");

  const pageById = new Map(pages.map((p) => [p.id, p]));
  const incoming = new Map(pages.map((p) => [p.id, 0]));
  for (const t of transitions) {
    if (pageById.has(t.to)) incoming.set(t.to, (incoming.get(t.to) || 0) + 1);
  }

  /** @type {Map<string, number>} */
  const depth = new Map();
  const queue = [];
  for (const p of pages) {
    const isRoot =
      !(typeof p.parentId === "string" && pageById.has(p.parentId)) &&
      (incoming.get(p.id) || 0) === 0;
    if (isRoot) {
      depth.set(p.id, 0);
      queue.push(p.id);
    }
  }
  if (!queue.length && pages[0]) {
    depth.set(pages[0].id, 0);
    queue.push(pages[0].id);
  }
  for (const p of pages) {
    if (!depth.has(p.id) && typeof p.parentId === "string" && !pageById.has(p.parentId)) {
      depth.set(p.id, 0);
      queue.push(p.id);
    }
  }

  while (queue.length) {
    const id = queue.shift();
    const d = depth.get(id) ?? 0;
    for (const t of transitions) {
      if (t.from !== id || !pageById.has(t.to)) continue;
      const next = d + 1;
      if (!depth.has(t.to) || next < /** @type {number} */ (depth.get(t.to))) {
        depth.set(t.to, next);
        queue.push(t.to);
      }
    }
  }
  for (const p of pages) {
    if (!depth.has(p.id)) {
      if (typeof p.parentId === "string" && depth.has(p.parentId)) {
        depth.set(p.id, /** @type {number} */ (depth.get(p.parentId)) + 1);
      } else {
        depth.set(p.id, Math.max(...depth.values(), 0) + 1);
      }
    }
  }

  /** @type {Map<number, string[]>} */
  const layers = new Map();
  for (const p of pages) {
    const d = /** @type {number} */ (depth.get(p.id));
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(p.id);
  }
  const maxDepth = Math.max(...layers.keys(), 0);
  for (const [, ids] of layers) {
    ids.sort((a, b) =>
      pageDisplayName(pageById.get(a), pages).localeCompare(pageDisplayName(pageById.get(b), pages)),
    );
  }

  const nodeW = 196;
  const nodeH = 70;
  const gapX = 96;
  const gapY = 28;
  const padX = 36;
  const padY = 28;
  let maxRows = 1;
  for (const ids of layers.values()) maxRows = Math.max(maxRows, ids.length);

  const width = padX * 2 + (maxDepth + 1) * nodeW + maxDepth * gapX;
  const height = padY * 2 + maxRows * nodeH + (maxRows - 1) * gapY;

  /** @type {Map<string, {x:number;y:number;cx:number;cy:number}>} */
  const pos = new Map();
  for (let d = 0; d <= maxDepth; d++) {
    const ids = layers.get(d) || [];
    const colHeight = ids.length * nodeH + Math.max(0, ids.length - 1) * gapY;
    const startY = padY + (height - padY * 2 - colHeight) / 2;
    ids.forEach((id, i) => {
      const x = padX + d * (nodeW + gapX);
      const y = startY + i * (nodeH + gapY);
      pos.set(id, { x, y, cx: x + nodeW / 2, cy: y + nodeH / 2 });
    });
  }

  const edgeParts = [];
  transitions.forEach((t, edgeIdx) => {
    const a = pos.get(t.from);
    const b = pos.get(t.to);
    if (!a || !b) return;
    const x1 = a.x + nodeW;
    const y1 = a.cy;
    const x2 = b.x;
    const y2 = b.cy;
    const dx = Math.max(40, (x2 - x1) * 0.45);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const label = actionLabel(t.action);
    const labelW = Math.min(160, 18 + label.length * 6.2);
    const labelH = 20;
    edgeParts.push(`
      <g class="g-edge-group">
        <path class="g-edge" d="M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}" marker-end="url(#g-arrow)"/>
        <g class="g-edge-chip" transform="translate(${midX - labelW / 2} ${midY - labelH / 2 - (edgeIdx % 2 === 0 ? 0 : 10)})">
          <rect width="${labelW}" height="${labelH}" rx="10"/>
          <text class="g-edge-label" x="${labelW / 2}" y="${labelH / 2 + 4}"
            font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="10" font-weight="400"
            fill="currentColor">${escapeXml(truncateLabel(label, 24))}</text>
        </g>
      </g>
    `);
  });

  const nodeParts = pages.map((p) => {
    const pnt = pos.get(p.id);
    if (!pnt) return "";
    const status = String(p.status || "DISCOVERED").toLowerCase();
    const title = truncateLabel(pageDisplayName(p, pages), 22);
    const path = truncateLabel(shortUrl(String(p.url || "")), 28);
    const isRoot = (depth.get(p.id) || 0) === 0;
    return `
      <g class="g-node status-${escapeXml(status)}${isRoot ? " is-root" : ""}" data-page-id="${escapeXml(p.id)}" transform="translate(${pnt.x} ${pnt.y})" role="button" tabindex="0">
        <title>${escapeXml(`${pageDisplayName(p, pages)}\n${p.url || ""}\n${p.status || ""}`)}</title>
        <rect class="g-card" width="${nodeW}" height="${nodeH}" rx="12"/>
        <rect class="g-accent" x="0" y="0" width="4" height="${nodeH}" rx="2"/>
        <text class="g-kicker" x="16" y="22"
          font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="9" font-weight="400"
          fill="currentColor" letter-spacing="0.06em">${isRoot ? "START" : escapeXml(String(p.status || "").toUpperCase())}</text>
        <text class="g-title" x="16" y="42"
          font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="13" font-weight="400"
          fill="currentColor">${escapeXml(title)}</text>
        <text class="g-sub" x="16" y="58"
          font-family="IBM Plex Mono, JetBrains Mono, monospace" font-size="10" font-weight="400"
          fill="currentColor">${escapeXml(path)}</text>
      </g>
    `;
  });

  els.graphSvg.setAttribute("viewBox", `0 0 ${Math.max(width, 420)} ${Math.max(height, 220)}`);
  els.graphSvg.innerHTML = `
    <defs>
      <marker id="g-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0 1.5L8 5L0 8.5z" class="g-arrow-head"/>
      </marker>
    </defs>
    <g class="g-edges">${edgeParts.join("")}</g>
    <g class="g-nodes">${nodeParts.join("")}</g>
  `;
  applyGraphZoom();

  const selectNode = (pageId) => {
    els.graphSvg.querySelectorAll(".g-node").forEach((n) => n.classList.remove("selected"));
    const node = els.graphSvg.querySelector(`.g-node[data-page-id="${CSS.escape(pageId)}"]`);
    node?.classList.add("selected");
    const page = pageById.get(pageId);
    if (page) showGraphDetail(page, pages, transitions);
  };

  els.graphSvg.querySelectorAll(".g-node").forEach((node) => {
    node.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = node.getAttribute("data-page-id");
      if (id) selectNode(id);
    });
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const id = node.getAttribute("data-page-id");
        if (id) selectNode(id);
      }
    });
  });

  // Auto-select start page for immediate context
  const rootId =
    [...depth.entries()].find(([, d]) => d === 0)?.[0] || pages[0]?.id;
  if (rootId) selectNode(rootId);
}

function applyGraphZoom() {
  const zoom = state.graphZoom;
  els.graphZoomPct.textContent = `${Math.round(zoom * 100)}%`;
  const vb = els.graphSvg.viewBox?.baseVal;
  const baseW = vb?.width > 0 ? vb.width : 640;
  const baseH = vb?.height > 0 ? vb.height : 260;
  els.graphSvg.style.width = `${baseW * zoom}px`;
  els.graphSvg.style.height = `${baseH * zoom}px`;
  els.graphSvg.style.minWidth = `${baseW * zoom}px`;
  els.graphSvg.style.transform = "";
  els.btnGraphZoomOut.disabled = zoom <= 0.5;
  els.btnGraphZoomIn.disabled = zoom >= 2.5;
}

function setGraphZoom(next) {
  const clamped = Math.min(2.5, Math.max(0.5, Math.round(next * 20) / 20));
  state.graphZoom = clamped;
  applyGraphZoom();
}

async function refreshGraph(sessionId) {
  if (!sessionId) {
    state.graph = null;
    clearGraphDetail();
    renderGraphView({ pages: [], transitions: [] });
    return;
  }
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(sessionId)}/graph`);
    if (!Array.isArray(data?.pages)) {
      throw new Error("Graph API unavailable — restart the UI server (npm run ui)");
    }
    state.graph = data;
    renderGraphView(data);
  } catch (err) {
    clearGraphDetail();
    els.graphEmpty.textContent =
      err instanceof Error
        ? err.message
        : "Could not load graph. Restart the UI server and try Refresh.";
    els.graphEmpty.classList.remove("hidden");
    els.graphSvg.classList.add("hidden");
    els.graphNodeCount.textContent = "0 pages";
    els.graphEdgeCount.textContent = "0 transitions";
  }
}

function downloadAll() {
  closeMenu();
  if (!state.selectedId) return;
  const a = document.createElement("a");
  a.href = `/api/sessions/${encodeURIComponent(state.selectedId)}/documents/download-all`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
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
      framework: els.inputFramework.value || "independent",
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
    setCenterTab("live");
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

els.btnViewAll.addEventListener("click", () => {
  els.sessionList.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

els.toggleAutoscroll.addEventListener("change", () => {
  state.autoScroll = els.toggleAutoscroll.checked;
});

els.btnClearCanvas.addEventListener("click", () => {
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

for (const id of ["live", "changes", "stats", "graph", "settings"]) {
  document.getElementById(`ctab-${id}`)?.addEventListener("click", () => setCenterTab(id));
}

els.btnGraphRefresh.addEventListener("click", () => void refreshGraph(state.selectedId));
els.btnGraphZoomIn.addEventListener("click", () => setGraphZoom(state.graphZoom + 0.25));
els.btnGraphZoomOut.addEventListener("click", () => setGraphZoom(state.graphZoom - 0.25));
els.btnGraphZoomReset.addEventListener("click", () => setGraphZoom(1));

els.graphViewport.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (state.centerTab !== "graph") return;
    e.preventDefault();
    setGraphZoom(state.graphZoom + (e.deltaY < 0 ? 0.1 : -0.1));
  },
  { passive: false },
);

els.btnDownloadAll.addEventListener("click", downloadAll);
els.btnDownloadZip.addEventListener("click", downloadAll);

els.btnResume.addEventListener("click", async () => {
  const session = selectedSession();
  if (!session) return;
  const password = session.username
    ? window.prompt("Password (not stored; required only if the app needs login):") ?? undefined
    : undefined;
  try {
    const { session: next } = await api(`/api/sessions/${encodeURIComponent(session.id)}/resume`, {
      method: "POST",
      body: JSON.stringify({ password: password || undefined }),
    });
    upsertSession(next);
    await selectSession(next.id);
    setCenterTab("live");
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
});

els.btnPause.addEventListener("click", async () => {
  if (!state.selectedId) return;
  try {
    const { session } = await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/pause`, {
      method: "POST",
      body: "{}",
    });
    upsertSession(session);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
});

els.btnStop.addEventListener("click", async () => {
  if (!state.selectedId) return;
  try {
    const { session } = await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/stop`, {
      method: "POST",
      body: "{}",
    });
    upsertSession(session);
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  }
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
    state.graph = null;
    renderSessionLists();
    if (state.sessions.length) {
      await selectSession(state.sessions[0].id);
    } else {
      renderStats(null);
      renderContext(null, []);
      renderHeader(null);
      renderChanges(null);
      renderTimeline([]);
      renderGraphView({ pages: [], transitions: [] });
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
    const { session: next } = await api(`/api/sessions/${encodeURIComponent(session.id)}/resume`, {
      method: "POST",
      body: JSON.stringify({ password: password || undefined }),
    });
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

function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("ae-theme", next);
  } catch {
    /* ignore */
  }
  const label = next === "dark" ? "Switch to light theme" : "Switch to dark theme";
  els.btnTheme.title = label;
  els.btnTheme.setAttribute("aria-label", label);
}

function toggleTheme() {
  applyTheme(getTheme() === "dark" ? "light" : "dark");
}

applyTheme(getTheme());
els.btnTheme.addEventListener("click", toggleTheme);

function openHelp() {
  els.helpModal.classList.remove("hidden");
  els.helpClose.focus();
}

function closeHelp() {
  els.helpModal.classList.add("hidden");
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!els.docModal.classList.contains("hidden")) closeDocument();
  else if (!els.helpModal.classList.contains("hidden")) closeHelp();
});

els.btnHelp.addEventListener("click", openHelp);
els.helpClose.addEventListener("click", closeHelp);
els.helpModal.addEventListener("click", (e) => {
  if (e.target === els.helpModal) closeHelp();
});

loadSessions().catch((err) => {
  console.error(err);
  els.formError.textContent = "Could not load sessions. Is the server running?";
  els.formError.classList.remove("hidden");
});

initFrameworkPicker();
