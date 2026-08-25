# Feature: Multi-Application Exploration Sessions & Live Exploration Canvas

## Context

The Application Exploration Agent is already implemented.

Do **not** rebuild or redesign the existing exploration engine.

This feature adds a web UI that allows users to:

1. Enter an application URL.
2. Optionally provide username and password.
3. Start an exploration.
4. Watch the exploration happen in real time.
5. See browser initialization, navigation, discovery, clicks, selections, and other exploration activities on a live canvas.
6. Have each application exploration stored as a separate session.
7. Explore multiple applications independently.
8. View the generated `application-context` documents for each session.
9. Switch between previously explored applications/sessions.

The existing exploration functionality should remain intact.

---

# 1. Primary User Experience

The user should be able to open the application and immediately see:

```text
┌─────────────────────────────────────────────────────────────┐
│ Application Explorer                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Start New Exploration                                      │
│                                                             │
│ Application URL *                                           │
│ [ https://example.com                              ]        │
│                                                             │
│ Username (Optional)                                         │
│ [                                                ]          │
│                                                             │
│ Password (Optional)                                         │
│ [                                                ]          │
│                                                             │
│             [ Start Exploring ]                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

After clicking **Start Exploring**, the UI should transition into the exploration workspace.

---

# 2. Main Workspace

The workspace should have three logical areas:

```text
┌──────────────┬────────────────────────────────┬───────────────┐
│              │                                │               │
│   Sessions   │       Exploration Canvas      │ Application   │
│              │                                │   Context     │
│              │                                │               │
│              │   Live exploration activity   │   Documents   │
│              │                                │               │
│              │                                │               │
│              │                                │               │
└──────────────┴────────────────────────────────┴───────────────┘
```

### Left

Session/application navigation.

### Center

Live exploration canvas.

### Right

Application context and generated documents.

---

# 3. Left Panel — Sessions

The user can explore more than one application.

Each exploration must have its own persistent session.

Example:

```text
Sessions

+ New Exploration

● E-Commerce Application
  https://shop.example.com
  Exploring...

○ CRM Application
  https://crm.example.com
  Completed
  42 pages

○ HR Portal
  https://hr.example.com
  Completed
  28 pages
```

The user should be able to select a session and view its exploration data.

Each session must be isolated.

Data from:

```text
CRM Application
```

must never appear inside:

```text
E-Commerce Application
```

---

# 4. Session Model

Create a persistent session model.

Minimum information:

```typescript
interface ExplorationSession {
  id: string;
  applicationName: string;
  applicationUrl: string;

  username?: string;

  status:
    | "created"
    | "initializing"
    | "exploring"
    | "completed"
    | "failed"
    | "paused";

  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  statistics: {
    pages: number;
    elements: number;
    actions: number;
    flows: number;
  };

  contextPath: string;
}
```

Do not store the password in the session model.

Passwords must never be persisted in the session database.

---

# 5. Application Name

The application name should be determined automatically where possible.

Preferred order:

1. Existing application metadata if available.
2. Page title.
3. Domain name.
4. URL hostname.

Example:

```text
https://crm.company.com

→ CRM Application
```

The user should not be required to manually provide an application name.

Allow renaming later if the existing product architecture supports it.

---

# 6. Start Exploration

When the user clicks:

```text
Start Exploring
```

the UI should:

1. Validate URL.
2. Create a new exploration session.
3. Generate a session ID.
4. Initialize the exploration engine.
5. Open the browser.
6. Navigate to the provided URL.
7. Stream exploration events to the UI.
8. Update session statistics.
9. Generate application context when exploration finishes.
10. Associate all generated context with the current session.

Do not reload the page to display progress.

The exploration should happen through the existing exploration engine.

---

# 7. Live Exploration Canvas

The center panel is the most important part of this feature.

The user must see exploration activity **while the exploration is happening**.

Example:

```text
Exploration Canvas

● Browser Initialization
  Launching Chromium browser
  ✓ Success

● Navigating to URL
  https://example.com
  ✓ Success

● Page Loaded
  Example Application
  ✓ Success

● Discovering Elements
  Found 32 interactive elements

● Clicking Login
  Element: "Login"
  ✓ Success

● Navigating
  /login
  ✓ New page discovered

● Filling Form
  Username field
  ✓ Success

● Filling Form
  Password field
  ✓ Success

● Clicking Sign In
  ✓ Success

● Navigating
  /dashboard
  ✓ New page discovered

● Discovering Elements
  Found 48 interactive elements

● Exploring Products
  In progress...
```

The newest event should automatically appear at the bottom.

---

# 8. Exploration Events

The existing exploration engine should expose events to the UI.

Create or reuse an event model similar to:

```typescript
interface ExplorationEvent {
  id: string;
  sessionId: string;

  timestamp: string;

  type:
    | "browser_initialized"
    | "navigation_started"
    | "navigation_completed"
    | "page_discovered"
    | "elements_discovered"
    | "action_started"
    | "action_completed"
    | "action_failed"
    | "action_skipped"
    | "flow_discovered"
    | "exploration_completed"
    | "exploration_failed";

  title: string;
  description?: string;

  metadata?: Record<string, unknown>;

  status:
    | "running"
    | "success"
    | "failed"
    | "skipped";
}
```

Do not couple the UI directly to internal Playwright events.

The exploration engine should publish application-level events.

---

# 9. Real-Time Communication

Use the simplest suitable mechanism supported by the existing application.

Preferred options:

1. Server-Sent Events
2. WebSocket
3. Existing event streaming mechanism

Do not introduce WebSockets if the existing architecture already has a simpler event-streaming mechanism.

The requirement is:

> The UI must receive exploration events in real time without polling aggressively.

---

# 10. Exploration Progress

The canvas should display a compact progress/metrics section.

Example:

```text
Exploration Progress

██████████████░░░░░░ 65%

Pages       14
Elements    312
Actions      87
Flows         9
```

The statistics should update as exploration progresses.

Do not invent a percentage if the exploration engine cannot calculate meaningful coverage.

If there is no reliable coverage percentage, display:

```text
Exploration in progress
```

and show the discovered counts instead.

---

# 11. Right Panel — Application Context

When a session is active or completed, the right panel should display its application context.

Example:

```text
Application Context

E-Commerce Application
https://shop.example.com

Documents

📄 application.md
   Application Overview

📄 pages.md
   Discovered Pages

📄 flows.md
   Application Flows

📄 selectors.md
   Element Selectors

{} application.json
   Machine Readable Data

📄 AGENTS.md
   Coding Agent Guide
```

Each document belongs only to the selected session.

---

# 12. Document Interaction

The user should be able to:

* View document
* Download document
* See document metadata
* Switch between documents

If the existing application already has a document viewer, reuse it.

Do not introduce a new document rendering architecture unless necessary.

The right panel should remain compact.

---

# 13. Session Switching

If the user selects another application:

```text
CRM Application
```

the entire workspace should update to that session:

```text
Center:
CRM exploration events

Right:
CRM application context

Statistics:
CRM statistics
```

Never mix events or documents between sessions.

The selected session should be clearly indicated.

---

# 14. Completed Session

Once exploration finishes:

```text
Exploration Completed

✓ Exploration completed successfully

Pages       42
Elements    621
Actions     184
Flows        23

Application Context

✓ application.md
✓ pages.md
✓ flows.md
✓ selectors.md
✓ application.json
✓ AGENTS.md
```

The session should remain accessible after completion.

The user must be able to return to it later.

---

# 15. Multiple Applications

The application should support:

```text
Application A
    Session A

Application B
    Session B

Application C
    Session C
```

Each session has:

```text
Session
├── Exploration events
├── Application model
├── Memory
├── Pages
├── Elements
├── Flows
├── Selectors
└── Generated documents
```

Do not create a global application context that combines all applications.

---

# 16. New Exploration

Provide a clear:

```text
+ New Exploration
```

button.

Clicking it should open/reset the input form:

```text
Application URL *
Username
Password

[ Start Exploring ]
```

Starting a new exploration must create a new session.

It must not overwrite the previous application context.

---

# 17. Session Persistence

Sessions must survive application restart.

Example storage:

```text
data/
├── sessions/
│   ├── session-001/
│   │   ├── session.json
│   │   ├── events.json
│   │   └── application-context/
│   │
│   ├── session-002/
│   │   ├── session.json
│   │   ├── events.json
│   │   └── application-context/
│   │
│   └── session-003/
│       ├── session.json
│       ├── events.json
│       └── application-context/
```

Reuse the existing persistence layer if one already exists.

Do not introduce a database solely for this feature if the current application already has an appropriate persistence mechanism.

---

# 18. UI States

Implement these states clearly.

## Empty State

No exploration exists.

Show:

```text
Start your first application exploration

Enter an application URL to begin discovering
pages, flows, elements, and selectors.

[ Start New Exploration ]
```

## Initializing

```text
Initializing browser...
```

## Exploring

```text
Exploration Canvas
LIVE
```

Display real-time events.

## Completed

```text
Exploration Completed
```

Show final statistics and documents.

## Failed

```text
Exploration Failed

Reason:
Unable to initialize browser

[ Retry ]
```

The error should be actionable.

---

# 19. Do Not Build These as Part of This Feature

This feature is strictly about:

* Multi-application sessions
* Start exploration UI
* Real-time exploration canvas
* Session persistence
* Application context navigation

Do NOT modify or add:

* Test generation
* Automation code generation
* New selector algorithms
* New exploration algorithms
* RAG
* Vector database
* Multi-agent architecture
* AI model selection
* Mobile support
* CI/CD
* Jira integration
* Framework-specific automation generation

Use the existing exploration engine.

---

# 20. Visual Design

Use a clean developer-tool/dashboard aesthetic.

Layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ Application Explorer                              Settings  │
├──────────────┬──────────────────────────────┬───────────────┤
│              │                              │               │
│  Sessions    │   Exploration Canvas        │ Application   │
│              │                              │ Context       │
│ + New        │   LIVE                      │               │
│              │                              │ E-Commerce    │
│ E-Commerce   │   ● Browser Init            │ Application   │
│ CRM          │   ● Navigate                │               │
│ HR Portal    │   ● Discover                │ Documents     │
│              │   ● Click                   │               │
│              │   ● Navigate                │               │
│              │   ● Discover                │               │
│              │                              │ application   │
│              │                              │ pages         │
│              │                              │ flows         │
│              │                              │ selectors     │
└──────────────┴──────────────────────────────┴───────────────┘
```

Prioritize:

* Readability
* Clear hierarchy
* Real-time status
* Compact information density
* Developer-tool aesthetic
* Minimal visual noise

Do not overuse animations.

---

# 21. Important UX Principle

The user should always know:

1. Which application is being explored.
2. Whether exploration is running.
3. What the agent is currently doing.
4. What has already been discovered.
5. Whether an action succeeded, failed, or was skipped.
6. Where the generated application context is stored.
7. Which session they are currently viewing.

---

# 22. Acceptance Criteria

### Start Exploration

* [ ] URL field exists.
* [ ] Username is optional.
* [ ] Password is optional.
* [ ] URL validation exists.
* [ ] Start Exploring creates a new session.
* [ ] Existing sessions are not overwritten.

### Live Canvas

* [ ] Browser initialization is visible.
* [ ] Navigation is visible.
* [ ] Page discovery is visible.
* [ ] Element discovery is visible.
* [ ] Actions are visible.
* [ ] Success/failure/skipped status is visible.
* [ ] Events appear in real time.
* [ ] Latest event is visible automatically.

### Sessions

* [ ] Multiple applications can be explored.
* [ ] Every exploration has a unique session.
* [ ] Sessions persist after restart.
* [ ] Sessions can be selected.
* [ ] Selecting a session loads its data.
* [ ] Session data is isolated.

### Application Context

* [ ] Context is associated with the correct session.
* [ ] Documents are visible after generation.
* [ ] application.md is visible.
* [ ] pages.md is visible.
* [ ] flows.md is visible.
* [ ] selectors.md is visible.
* [ ] application.json is visible.
* [ ] AGENTS.md is visible if generated by the existing engine.

### Completion

* [ ] Completed status is visible.
* [ ] Final statistics are displayed.
* [ ] Generated documents are accessible.
* [ ] User can start another exploration.

---

# 23. Implementation Approach

Before writing code:

1. Inspect the existing codebase.
2. Identify the existing exploration engine.
3. Identify how exploration status/events are currently exposed.
4. Identify the current application-context generation mechanism.
5. Identify existing persistence/storage.
6. Identify the current UI architecture and component library.
7. Reuse existing components and infrastructure wherever possible.

Do not replace working architecture.

Do not create duplicate exploration logic.

Do not introduce dependencies unless required.

---

# 24. Implementation Order

Implement incrementally.

### Phase 1 — Session Model

Add:

* Exploration session
* Session persistence
* Session selection

### Phase 2 — Start Exploration UI

Add:

* URL input
* Optional username
* Optional password
* Start Exploring
* New session creation

### Phase 3 — Live Event Stream

Connect the existing exploration engine to the UI.

Display:

* Initialization
* Navigation
* Discovery
* Actions
* Results
* Errors

### Phase 4 — Exploration Canvas

Build the real-time timeline/canvas.

### Phase 5 — Application Context Panel

Display:

* Application name
* URL
* Documents
* Session information

### Phase 6 — Multiple Sessions

Allow switching between applications.

### Phase 7 — Polish

Improve:

* Empty states
* Loading states
* Error states
* Responsive behavior
* Session status
* Document navigation

---

# 25. Engineering Constraints

Follow these constraints strictly:

1. Reuse the existing exploration engine.
2. Do not duplicate browser automation logic.
3. Keep the feature modular.
4. Do not add unnecessary infrastructure.
5. Do not introduce AI functionality for this UI feature.
6. Do not store passwords.
7. Keep session data isolated.
8. Prefer existing project patterns over new patterns.
9. Keep real-time communication simple.
10. Maintain existing functionality and tests.

---

# 26. Definition of Done

The feature is complete when a user can:

```text
1. Open the Application Explorer.

2. Enter:
   Application URL
   Optional username
   Optional password

3. Click:
   Start Exploring

4. See:
   Browser initialization

5. See:
   Navigation to application

6. See:
   Exploration activities in real time

7. See:
   Pages/elements/actions discovered

8. Wait for:
   Exploration completion

9. See:
   Generated application-context documents

10. Start another exploration.

11. Explore a completely different application.

12. Switch back to the first application.

13. See its original exploration events and documents.

14. Restart the application.

15. Still see all previous exploration sessions.
```

---

# 27. Final UX Flow

The finished experience should feel like:

```text
                APPLICATION EXPLORER

                         │
                         ▼

              ┌─────────────────────┐
              │ Start New Exploration│
              │                     │
              │ URL                 │
              │ Username (optional) │
              │ Password (optional) │
              │                     │
              │ [ Start Exploring ] │
              └──────────┬──────────┘
                         │
                         ▼
              Create Exploration Session
                         │
                         ▼
        ┌───────────────────────────────────┐
        │                                   │
        │      LIVE EXPLORATION CANVAS      │
        │                                   │
        │  Browser initialized              │
        │  Navigating                       │
        │  Page discovered                  │
        │  Elements discovered              │
        │  Clicking                         │
        │  Selecting                        │
        │  Navigating                       │
        │  Flow discovered                  │
        │                                   │
        └─────────────────┬─────────────────┘
                          │
                          ▼
                 Exploration Complete
                          │
                          ▼
        ┌───────────────────────────────────┐
        │        APPLICATION CONTEXT        │
        │                                   │
        │ application.md                    │
        │ pages.md                          │
        │ flows.md                          │
        │ selectors.md                      │
        │ application.json                  │
        │ AGENTS.md                         │
        │                                   │
        └───────────────────────────────────┘
                          │
                          ▼
                 Persist Session
                          │
                          ▼
               Explore Another App
```

## Most Important Requirement

**Treat this as a UI/session layer over the existing Application Exploration Agent, not as a new exploration implementation.**

The existing explorer remains the source of truth for exploration behavior.

This feature is responsible for making that capability:

> **visual, observable, persistent, multi-application, and consumable by developers/coding agents.**
