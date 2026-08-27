# Phase: Hardening Against Real Applications

## Status

**UI direction locked.** Phase **H-A** implementation in progress (A + C shell + skip reasons + stability profile + Pause/Stop + Details).

| Artifact | Path |
|---|---|
| This plan | `docs/hardening-real-apps.md` |
| Locked UI mockup (A + C) | `docs/hardening-ui-final-mockup.html` |
| Product foundation | `docs/doc.md` |
| Prior session UI (historical) | `docs/ui-enhance.md` |
| Resume / framework / CONTEXT | `docs/Application_Explorer_Feature_Implementation_Prompt.md` |

---

## Locked UI requirement (A + C)

The product UI for this phase **must** follow the hybrid below. Do not implement the previous three-column / multi-tab canvas as the hardening shell.

### Empty state (Option C) — no sessions yet

```text
Centered calm start
  · Headline + one sentence
  · Application URL (required)
  · [ Start exploring ]
  · Optional settings (collapsed) → auth, framework, profile, allowlist, depth toggles
```

No left session list, no live stream, no docs panel until the first session exists.

### Workspace (Option A) — one or more sessions

```text
┌──────────────────┬─────────────────────────────────────────┐
│ New exploration  │  App name · status · Pause / Stop       │
│ URL + Start      │                                         │
│ Configure…       │  Live event stream (primary)            │
│                  │                                         │
│ Sessions         │  Pages · Elements · Skipped · ETA       │
│  · Acme          │  Details · Docs  (on demand)            │
│  · Demo CRM      │                                         │
└──────────────────┴─────────────────────────────────────────┘
```

### Progressive disclosure (required)

| Concern | Where it lives |
|---|---|
| Auth / profile / allowlist / shadow / frames | **Optional settings** (empty) or **Configure…** (workspace) |
| Coverage, skip reasons, health | **Details** sheet (on demand) — not a permanent tab |
| CONTEXT.md and other files | **Docs** sheet (on demand) |
| Graph / Statistics / Change Summary / Settings tabs | **Not** primary chrome in this phase; graph may remain reachable later via Details if needed |
| Manual SSO wait | Inline banner above the stream with Continue / Stop |
| Exploration limitations | Banner when completed and skips > 0 |

### UI non-goals for this phase

```text
❌ Always-visible right column (context / docs / changes cards)
❌ Five center tabs as the default shell
❌ Dense start form with all hardening controls expanded
❌ Wizard / icon-rail / inspector as the primary layout
```

Canonical preview with dummy data: open `docs/hardening-ui-final-mockup.html`.

---

## 1. Objective

Make Application Explorer reliable on **real production-like web apps**, not only the included demo CRM.

V1 already delivers the full reconnaissance loop (explore → context → resume → changes). This phase does **not** add test generation, cloud execution, or new product categories. It hardens discovery, interaction, auth, and operator control so exploration quality holds up outside the demo — behind a **simpler A + C UI**.

### Success metric

> An SDET can explore a typical internal SPA (login wall, nested navigation, modals, shadow components, occasional iframes) and get usable `CONTEXT.md` without babysitting the browser.

---

## 2. Current Baseline (V1)

| Area | Behavior |
|---|---|
| Discovery | Visible interactive elements via main-document `querySelectorAll` |
| Auth | Optional username/password heuristics + Playwright `--storage-state` |
| Stability | Short settle waits after navigation; hash URL handling |
| Safety | Destructive actions skipped by classifier |
| State | Fingerprints + graph; best-effort return-to-page |
| UI | Three-column live canvas (to be simplified to A + C) |
| Output | Neutral Markdown/JSON + optional Playwright / Selenium Java docs |

Known gaps against real apps:

```text
✗ Shadow DOM (open/closed) not traversed
✗ Cross-frame / iframe content not discovered or interacted with
✗ Custom elements / canvas / virtualized lists under-represented
✗ SPA network/idle stability is shallow (easy to click before hydrate)
✗ OAuth / SSO / MFA / redirect login not first-class
✗ Cookie / consent overlays can block the whole session
✗ New tabs / window.open not tracked as exploration surface
✗ File upload / download flows largely ignored
✗ State restore often fails → early stop on that page
✗ Mid-run pause / cancel / domain allowlist limited or missing in UI
✗ Failure reasons are thin in the live feed
✗ Cypress / WebdriverIO / Selenium JS docs exist in model but disabled in UI
```

---

## 3. Non-Goals (This Phase)

```text
❌ Automated test generation / page objects as runnable code
❌ Native mobile / API exploration
❌ Full SSO provider integrations (Okta/Azure AD plugins)
❌ Solving closed Shadow DOM without user-provided hooks
❌ Exhaustive crawl of every virtualized row
❌ Self-healing locators in CI
❌ Cloud browser farms
❌ Reintroducing a dense multi-tab dashboard as the default UI
```

---

## 4. Principles

1. **Deterministic first** — heuristics and Playwright primitives before any LLM.
2. **Fail visible** — when something is skipped (iframe, closed shadow, SSO), record why in memory + UI (stream chips + Details).
3. **Opt-in depth** — deeper crawl modes (iframes, shadow) are configurable; defaults stay safe.
4. **A + C UI only** — calm empty start; essentials workspace; hardening behind Configure / Details / Docs.
5. **Demo remains the regression gate** — every hardening slice must still pass the local CRM e2e.

---

## 5. Workstreams

### H1 — Discovery surface expansion

**Goal:** Find elements that real apps hide behind frames and shadow roots.

| Item | Details |
|---|---|
| Open Shadow DOM | Traverse open roots during element snapshot; tag `host` in element metadata |
| Same-origin iframes | Optional: discover + explore frames listed in an allowlist |
| Cross-origin iframes | Detect and mark `BLOCKED` with reason `cross-origin-frame` (no interaction) |
| Closed Shadow DOM | Detect hosts; emit skip reason; optional user-provided pierce selectors later |
| Virtualized lists | Sample visible window only; note `virtualized` coverage gap in page notes |
| Coverage report | Per-page: main / shadow / frame / skipped counts (shown in Details) |

**Deliverables:** adapter APIs, model fields (`coverage`, `skipReasons`), docs updates, unit tests with fixture HTML.

---

### H2 — SPA stability & navigation resilience

**Goal:** Stop racing React/Vue/Angular hydrates and client-side routers.

| Item | Details |
|---|---|
| Stability policy | Configurable: `domcontentloaded` → short idle → optional `networkidle` (capped) |
| Mutation quiet window | Wait until DOM mutations settle for N ms |
| Soft navigations | Treat history push/replace as first-class navigations |
| Hydration guard | Retry getState if interactive count jumps right after load |
| State restore | Prefer graph back-path over blind `goBack`; URL + fingerprint verify |
| Action retry | One retry on detached frame / destroyed context (already partial) |

**Deliverables:** `StabilityProfile` in boundaries, explorer integration, metrics (`restoreFailures`, `stabilityWaits`).

---

### H3 — Auth & entry hardening

**Goal:** Get past the front door of real apps without storing passwords in session DB.

> **Note:** This workstream is **target-app** authentication (`authMode`: credentials / storage-state / manual-wait). Separately, the Live UI supports **explorer-user** login (self-register, per-user exploration sessions in PostgreSQL, Azure AD stub). Do not conflate the two. See [postgres.md](./postgres.md).

| Item | Details |
|---|---|
| Storage state in UI | Upload / path to Playwright `storageState` JSON (password still never persisted) |
| Auth mode | `none` \| `credentials` \| `storage-state` \| `manual-wait` |
| Manual wait | Headed mode: pause until user finishes SSO in the browser, then Continue (banner in A workspace) |
| Consent dismissal | Optional safe click on common cookie banners (allowlisted texts) |
| Login diagnostics | If still on login URL after attempt → clear error in stream + empty/workspace messaging |

**Deliverables:** session start payload fields, CLI parity, live events `auth.*`, safety notes in CONTEXT.

---

### H4 — Interaction resilience

**Goal:** Survive overlays, dialogs, and multi-surface navigation.

| Item | Details |
|---|---|
| Overlay detector | Before click: blocking dialog / toast / full-screen loader |
| Native dialogs | Auto-dismiss or accept policy (default: dismiss `alert`/`confirm` unless allowlisted) |
| Popup / new tab | Detect; either attach (same-origin) or mark skipped |
| Modal stack | Close or navigate back through known close controls before restore |
| Skip taxonomy | Stable reason codes for docs + stream chips + Details |

**Skip reason codes (initial set):**

```text
destructive
cross-origin-frame
closed-shadow
overlay-blocked
new-tab-untracked
auth-required
outside-allowlist
timeout
detached
virtualized-unseen
```

---

### H5 — Operator controls (A + C UI + CLI)

**Goal:** Let the SDET steer a long real-app run without a cluttered shell.

| Item | Details |
|---|---|
| Empty → workspace | First successful start transitions from C empty state to A workspace |
| Pause / Resume / Stop | Header controls in A workspace (+ API) |
| Domain allowlist | Default: start origin; optional extra hosts in Configure |
| Exploration profile | `Fast` / `Balanced` / `Deep` in Optional settings / Configure |
| Live stream | Primary surface; skip reasons as inline chips |
| Details sheet | Coverage, top skips, health, allowlist — toggled from footer |
| Docs sheet | Document list + zip download — toggled from footer |
| Limitations banner | Shown on completed runs when skips > 0 |

See: `docs/hardening-ui-final-mockup.html`.

---

### H6 — Real-app validation harness

**Goal:** Prove hardening with fixtures that mimic production pain, not only the demo CRM.

| Fixture | Covers |
|---|---|
| `demo/` (existing) | Regression |
| `fixtures/shadow-dom/` | Open shadow buttons/inputs |
| `fixtures/iframe-app/` | Same-origin nested frame |
| `fixtures/spa-delay/` | Late hydrate + client router |
| `fixtures/consent-wall/` | Cookie banner before app |
| Optional external | Documented manual checklist (e.g. public demo SPAs) |

**CI:** unit + fixture e2e; external sites remain manual / opt-in.

---

## 6. Phased Delivery

### Phase H-A — Foundations (1–2 weeks)

```text
1. Adopt A + C UI shell (empty state + essentials workspace)
2. Skip reason taxonomy + emit in actions / events (stream chips)
3. StabilityProfile (Balanced default) in Configure + CLI
4. Pause / Stop API + workspace header buttons
5. Details sheet (coverage / skips / health) — on demand
6. Fixture: spa-delay + consent-wall
```

**Exit:** UI matches locked mockup states; demo e2e green; SPA fixture explores without immediate false failures; Stop aborts cleanly.

### Phase H-B — Surface expansion (1–2 weeks)

```text
1. Open Shadow DOM traversal
2. Same-origin iframe opt-in (Configure + Deep profile)
3. Coverage counters in page model + Details sheet
4. Fixture: shadow-dom + iframe-app
5. Domain allowlist enforcement
```

**Exit:** Shadow + iframe fixtures produce elements/flows; cross-origin frames show explicit skips in stream + Details.

### Phase H-C — Auth entry (1 week)

```text
1. storage-state in Optional settings / Configure
2. Auth mode + manual-wait Continue banner
3. Consent dismissal toggle
4. Login failure messaging
```

**Exit:** Session can start from storage state via UI; SSO manual-wait testable in headed mode.

### Phase H-D — Interaction polish (ongoing)

```text
1. Overlay / modal handling improvements
2. Popup policy
3. Better state restore via graph path
4. Enable remaining framework doc generators (Cypress, WDIO, Selenium JS) as a parallel small track
```

**Exit:** Fewer early page stops; skip reasons explain residual gaps in CONTEXT.md.

---

## 7. Data Model Additions (Draft)

```text
ExplorationBoundaries
  + stabilityProfile: "fast" | "balanced" | "deep"
  + exploreOpenShadow: boolean
  + exploreSameOriginFrames: boolean
  + domainAllowlist: string[]
  + dismissConsent: boolean
  + authMode: "none" | "credentials" | "storage-state" | "manual-wait"

Page
  + coverage: { main, shadow, frame, skipped }
  + notes?: string[]

Action
  + skipReason?: SkipReasonCode

Session / Run events
  + auth.started | auth.succeeded | auth.failed | auth.manual_waiting
  + exploration.paused | exploration.stopped
  + coverage.updated
```

Passwords remain never persisted. Storage-state files are referenced by path or uploaded into session-private storage (gitignored), not logged.

---

## 8. CLI Parity

```text
--stability <fast|balanced|deep>
--explore-shadow
--explore-frames
--allow-host <host>          (repeatable)
--dismiss-consent
--auth-mode <...>
--storage-state <file>       (existing; surface in Configure)
--pause-on-login             (manual-wait helper)
```

`agent-explorer status` should surface pause state, coverage totals, and top skip reasons.

---

## 9. Documentation Output Impact

- `pages.md` — coverage + blocked surfaces per page
- `flows.md` — note incomplete flows due to skips
- `CONTEXT.md` — short “Exploration limitations” section when skips > 0
- `AGENTS.md` — how coding agents should treat `skipReason` / coverage gaps
- `changes/` — optional: new skip reasons as informational, not “removed elements”

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Deep crawl explodes time | Profiles + max-pages / max-duration; Deep is opt-in |
| Frame exploration escapes app | Domain allowlist default = start origin |
| Consent clicks hit wrong control | Strict text allowlist; off by default or Balanced+ |
| Manual SSO hangs sessions | Timeout + Stop; clear banner state |
| Fixture ≠ production | Manual checklist on 1–2 real apps before calling phase done |
| UI regresses to clutter | Treat `hardening-ui-final-mockup.html` as the acceptance visual |

---

## 11. Acceptance Criteria (Phase Complete)

### UI (locked)

- [x] No sessions → C empty state (URL + Start; settings collapsed)
- [x] After first session → A two-column workspace
- [x] Hardening controls only in Optional settings / Configure
- [x] Details and Docs open on demand (not always visible)
- [x] Pause / Stop in workspace header; Manual SSO banner when applicable
- [x] Completed run shows limitations banner when skips > 0
- [x] Visual behavior matches `hardening-ui-final-mockup.html` scenes

### Engine

- [ ] Open shadow elements discovered in fixture and reflected in `application.json`
- [ ] Same-origin iframe elements discovered when opt-in enabled
- [ ] Cross-origin iframes recorded as skipped with reason
- [ ] Balanced stability reduces SPA fixture flakiness vs Fast
- [ ] UI can start session with storage-state
- [ ] Manual-wait auth can be continued or stopped
- [x] Pause / Stop work without corrupting session memory
- [x] Details sheet shows coverage + top skip reasons
- [ ] Domain allowlist blocks off-origin navigation
- [x] Demo CRM e2e still passes
- [ ] CONTEXT.md mentions limitations when skips occurred
- [ ] README documents Configure options / flags

---

## 12. Suggested Next Step

1. Implement **H-A** (A + C shell + skip reasons + stability profile + Pause/Stop + Details).
2. Validate against `hardening-ui-final-mockup.html` scenes and demo + `spa-delay` fixture.
3. Then H-B → H-C → H-D.

Do not start H-B/H-C until H-A exit criteria pass.

---

## 13. Open Questions (engine only)

UI layout is **decided** (A + C). Remaining:

1. Default profile: keep today’s behavior as `Fast`, or make `Balanced` the new default?
2. Should same-origin iframes be on in `Deep` only, or also `Balanced`?
3. Where should uploaded `storageState` live — session dir only, or user-managed path?
4. Is headed manual SSO in scope for the first hardening release, or H-C stretch?
5. Enable Cypress / WDIO / Selenium JS doc generators in parallel, or after H-A?

---

## Product Principle (unchanged)

```text
Explore
  → Understand (including what we could not reach)
  → Persist
  → Re-explore
  → Detect Changes
  → Give CONTEXT.md to any coding agent
  → SDET decides what to automate
```

Hardening makes the **Understand** step honest on real apps: discover more when safe, and clearly report what remained out of reach — without a cluttered UI.
