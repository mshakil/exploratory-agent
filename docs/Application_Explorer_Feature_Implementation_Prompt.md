# Application Explorer — Feature Implementation Specification

## 1. Objective

Extend the existing Application Exploration Agent with three capabilities:

1. Persistent application sessions that can be resumed and re-explored.
2. A parent `CONTEXT.md` file that references the complete generated application context.
3. Optional framework selection that controls framework-specific generated documentation.

The existing exploration engine is already implemented and must remain the source of truth for browser exploration.

**Do not rebuild the exploration engine.**

---

# 2. Product Model

The product should distinguish between an **Application Session** and an **Exploration Run**.

```text
Application Session
│
├── Exploration Run 1
│   └── Initial discovery
│
├── Exploration Run 2
│   └── Resume / re-exploration
│
├── Exploration Run 3
│   └── Resume / re-exploration
│
└── Current Application Context
```

The Application Session is the long-lived entity.

Each exploration creates a run associated with that session.

The current application model represents the latest known state of the application.

---

# 3. User Experience

The main application should have three areas:

```text
┌────────────────┬────────────────────────────────┬──────────────────────┐
│                │                                │                      │
│   Sessions     │      Exploration Canvas        │ Application Context  │
│                │                                │                      │
│  + New         │      Live exploration          │   Documents          │
│                │      activity                  │                      │
│  E-Commerce    │                                │   CONTEXT.md         │
│  CRM Portal    │                                │   application.md     │
│  HR Portal     │                                │   pages.md           │
│                │                                │   flows.md           │
│                │                                │   selectors.md       │
│                │                                │   application.json   │
│                │                                │   framework.md       │
│                │                                │   AGENTS.md           │
└────────────────┴────────────────────────────────┴──────────────────────┘
```

---

# 4. New Exploration

The New Exploration form must contain:

```text
Application URL *
Username (Optional)
Password (Optional)
Framework (Optional)

[ Start Exploring ]
```

Framework options should be:

```text
Framework Independent
Playwright
Selenium Java
Selenium JavaScript
Cypress
WebdriverIO
```

Only expose frameworks that have an implemented generator.

Default:

```text
Framework Independent
```

The username and password must remain optional.

The password must never be persisted.

---

# 5. Framework Behavior

Framework selection affects **generated documentation only**.

It must NOT change:

- Browser exploration
- Element discovery
- Selector discovery
- State detection
- Application graph
- Memory
- Exploration algorithm

Architecture:

```text
                 Application Model
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
       Generic       Playwright    Selenium
       Generator      Generator    Generator
```

The application model remains framework-neutral.

For example:

```json
{
  "strategy": "testId",
  "value": "create-user"
}
```

A Playwright generator may render:

```typescript
page.getByTestId("create-user")
```

A Selenium Java generator may render:

```java
By.cssSelector("[data-testid='create-user']")
```

Do not duplicate selector discovery logic in framework generators.

---

# 6. Application Session

Use a persistent session model.

```typescript
interface ApplicationSession {
  id: string;

  applicationName: string;
  applicationUrl: string;

  username?: string;

  framework: Framework;

  status:
    | "created"
    | "exploring"
    | "completed"
    | "re-exploring"
    | "failed";

  createdAt: string;
  updatedAt: string;

  currentExplorationId?: string;

  statistics: {
    pages: number;
    elements: number;
    actions: number;
    flows: number;
  };

  contextPath: string;
}
```

Never persist the password.

---

# 7. Exploration Run

```typescript
interface ExplorationRun {
  id: string;

  sessionId: string;

  type:
    | "initial"
    | "resume";

  startedAt: string;
  completedAt?: string;

  status:
    | "running"
    | "completed"
    | "failed";

  statistics: {
    pagesDiscovered: number;
    pagesAdded: number;
    pagesRemoved: number;

    elementsDiscovered: number;
    elementsAdded: number;
    elementsRemoved: number;

    selectorsChanged: number;
    flowsAdded: number;
    flowsChanged: number;
  };
}
```

Previous exploration runs must remain available for history/audit purposes.

---

# 8. Resume Exploration

When the user selects an existing completed session and clicks:

```text
Resume Exploration
```

the system must:

1. Load the existing session.
2. Load its current application model.
3. Create a new exploration run.
4. Launch the browser.
5. Navigate to the application.
6. Re-explore using the existing exploration engine.
7. Compare current observations with previous knowledge.
8. Detect additions.
9. Detect removals.
10. Detect meaningful changes.
11. Revalidate existing selectors where possible.
12. Update the application model.
13. Persist the new exploration run.
14. Generate a change report.
15. Regenerate application context.
16. Update `CONTEXT.md`.

The previous context must not simply be deleted without retaining exploration history.

---

# 9. Resume UI

For a completed application session, show:

```text
E-Commerce Application
https://shop.example.com

Last explored:
25 Aug 2026

Pages: 42
Elements: 621
Flows: 23
Framework: Playwright

[ Resume Exploration ]
[ View Context ]
```

Do not create a separate application session when resuming.

Resume creates a new **Exploration Run** inside the existing session.

---

# 10. Live Resume Canvas

The existing live exploration canvas must support resume-specific events.

Example:

```text
Loaded previous knowledge
42 existing pages

Checking /dashboard
✓ Existing page verified

Checking /orders
✓ Existing page verified

New page discovered
+ /promotions

New element discovered
+ "View Promotions"

Removed page detected
- /legacy-orders

Selector changed
~ "Create Order"

Flow changed
~ "Create Order"

Exploration completed
```

The user should be able to distinguish:

- Existing
- New
- Removed
- Changed
- Skipped
- Failed

---

# 11. Change Detection

Detect:

## New

- Pages
- Elements
- Selectors
- Flows

## Removed

- Pages
- Elements
- Flows

## Changed

- Selectors
- Element properties
- Page structure
- Flow structure

Do not over-engineer matching.

Use stable identifiers where available:

1. URL
2. Test ID
3. Stable ID
4. Accessibility information
5. Semantic element identity

If an element cannot be confidently matched, mark it:

```text
Unresolved Change
```

Do not claim certainty where there is none.

---

# 12. Change Summary

After resume exploration, show:

```text
Exploration Changes

+ 3 New Pages
- 1 Removed Page
+ 27 New Elements
- 8 Removed Elements
~ 6 Changed Selectors
+ 2 New Flows
~ 3 Changed Flows
```

The UI should provide a detailed change view.

---

# 13. Change Report

Every resume run must generate:

```text
application-context/
└── changes/
    └── exploration-002.md
```

Example:

```markdown
# Exploration Changes

## Summary

- New pages: 3
- Removed pages: 1
- New elements: 27
- Removed elements: 8
- Changed selectors: 6
- New flows: 2
- Changed flows: 3

## New Pages

- Promotions
- Customer Segments
- Bulk Orders

## Removed Pages

- Legacy Orders

## Selector Changes

- Create Order
- Customer Search
- Export Orders
```

Historical change reports must not be overwritten.

---

# 14. Context Directory

The generated application context should be:

```text
application-context/
├── CONTEXT.md
├── application.md
├── pages.md
├── flows.md
├── selectors.md
├── application.json
├── AGENTS.md
├── changes/
│   ├── exploration-001.md
│   └── exploration-002.md
└── framework/
    └── playwright.md
```

If no framework is selected, omit the framework-specific file.

---

# 15. CONTEXT.md

`CONTEXT.md` is the **parent/entry-point document**.

The user should be able to give a coding agent only this file/path.

Example:

```text
/path/to/application-context/CONTEXT.md
```

The coding agent should then discover the other files from the references inside `CONTEXT.md`.

The file must contain:

- Application name
- Application URL
- Selected framework
- Current exploration status
- Current statistics
- Exploration history
- References to every generated context file
- Latest changes
- Instructions for consuming the context

Example:

```markdown
# Application Automation Context

## Application

Name: E-Commerce Application

URL: https://shop.example.com

## Framework

Playwright

## Context Files

- application.md
- pages.md
- flows.md
- selectors.md
- application.json
- AGENTS.md
- framework/playwright.md

## Change History

- changes/exploration-001.md
- changes/exploration-002.md

## How to Use

Read this file first.

Then inspect the referenced files required for the requested
automation task.

Use the framework-specific context when implementing automation.

Discovered flows are application behavior, not automatically test cases.
```

---

# 16. AGENTS.md

Generate an `AGENTS.md` file designed specifically for coding agents.

It should explain:

- What this application context represents.
- What each file contains.
- Which file is the parent entry point.
- How selectors should be interpreted.
- How framework-specific information should be used.
- That discovered flows are not automatically tests.
- That removed/changed elements should be considered before implementation.
- That `application.json` is the machine-readable source of truth.

The file should work with:

- Cursor
- Claude Code
- Codex
- Antigravity
- Other agentic IDEs

Do not create provider-specific files in V1.

---

# 17. Coding Agent Workflow

The intended workflow is:

```text
User explores application
        ↓
Application Explorer
        ↓
application-context/
        ↓
User downloads context
        ↓
User provides only:
CONTEXT.md
        ↓
Cursor / Claude Code / Codex / Antigravity
        ↓
Agent reads referenced context
        ↓
Agent implements requested automation
```

The user should NOT have to manually provide:

```text
application.md
pages.md
flows.md
selectors.md
application.json
...
```

Only the parent `CONTEXT.md` should be required as the entry point.

---

# 18. Main UI

The main application should have three columns.

## Left: Sessions

Show:

- New Exploration
- Existing applications
- Status
- Framework
- Last explored date
- Page count
- Element count
- Flow count

Example:

```text
APPLICATIONS

+ New Exploration

● E-Commerce Application
  https://shop.example.com
  Re-exploring
  Playwright

○ CRM Portal
  https://crm.example.com
  Completed
  Selenium Java

○ HR Portal
  https://hr.example.com
  Completed
  Framework Independent
```

---

# 19. Center: Exploration Canvas

Display real-time exploration activity.

Example:

```text
E-Commerce Application
RE-EXPLORING

[ Pause ] [ Stop ]

Exploration Canvas

10:24:15  Browser Initialized        Success
10:24:17  Navigating to URL          Success
10:24:20  Page Loaded                Success
10:24:21  Discovering Elements       32 elements
10:24:25  Click: Login               Success
10:24:27  Navigated: /login          New Page
10:24:29  Filling Username            Success
10:24:30  Filling Password            Success
10:24:32  Click: Sign In             Success
10:24:34  Navigated: /dashboard       New Page
10:24:37  Discovering Elements       48 elements
```

The latest event should automatically be visible.

---

# 20. Right: Application Context

Show:

```text
APPLICATION CONTEXT

E-Commerce Application

Framework: Playwright

Documents

CONTEXT.md
application.md
pages.md
flows.md
selectors.md
application.json
playwright.md
AGENTS.md

Latest Changes

+ 3 New Pages
- 1 Removed Page
~ 6 Changed Selectors

[ View Changes ]
```

Documents should be viewable/downloadable.

---

# 21. Real-Time Events

Expose application-level exploration events from the existing engine.

Suggested model:

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
    | "change_detected"
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

The UI must not depend directly on raw Playwright events.

---

# 22. Real-Time Transport

Use the simplest existing mechanism.

Preferred:

1. Server-Sent Events
2. WebSocket
3. Existing event streaming

Do not introduce WebSockets if SSE or an existing event mechanism is sufficient.

Avoid aggressive polling.

---

# 23. Storage

Reuse the existing persistence layer if one exists.

Logical structure:

```text
sessions/
└── <session-id>/
    ├── session.json
    ├── application.json
    ├── exploration-runs/
    │   ├── run-001.json
    │   ├── run-002.json
    │   └── run-003.json
    │
    ├── events/
    │   ├── run-001.json
    │   └── run-002.json
    │
    └── application-context/
        ├── CONTEXT.md
        ├── application.md
        ├── pages.md
        ├── flows.md
        ├── selectors.md
        ├── application.json
        ├── AGENTS.md
        ├── changes/
        └── framework/
```

---

# 24. Security

Never persist:

- Passwords
- Access tokens
- Session secrets
- Authentication cookies

Do not write credentials to:

- Markdown
- JSON
- Logs
- Change reports
- Application context

Mask sensitive values.

---

# 25. Non-Goals

Do NOT add:

- Test generation
- Bug generation
- Requirements generation
- API exploration
- Native mobile exploration
- RAG
- Vector database
- Embeddings
- Multi-agent orchestration
- Jira integration
- Cloud execution
- CI/CD
- Self-healing automation
- Framework-specific exploration engines

This feature is about persistent application knowledge and context generation.

---

# 26. Implementation Order

## Phase 1 — Session Model

Implement:

- ApplicationSession
- ExplorationRun
- Session persistence
- Session selection

## Phase 2 — Resume Exploration

Implement:

- Resume button
- Existing knowledge loading
- New exploration run
- Re-exploration
- Persistence

## Phase 3 — Change Detection

Implement:

- New pages
- Removed pages
- New elements
- Removed elements
- Selector changes
- Flow changes

## Phase 4 — Change Reports

Implement:

- Change report generation
- Historical reports
- UI change summary

## Phase 5 — CONTEXT.md

Implement:

- Parent document
- References to generated files
- Exploration history
- Current application state

## Phase 6 — Framework Selection

Implement:

- Framework model
- Optional UI selection
- Session framework persistence

## Phase 7 — Framework Generators

Initially implement:

- Framework Independent
- Playwright
- Selenium Java

Add additional frameworks only after the generator architecture is stable.

## Phase 8 — UI Polish

Implement:

- Empty states
- Loading states
- Error states
- Resume progress
- Change visualization
- Document navigation

---

# 27. Testing

Add tests for:

## Session

- Create session
- Persist session
- Load session
- Switch sessions
- Resume session

## Exploration Run

- Initial run
- Resume run
- Run history
- Failed run

## Change Detection

- New page
- Removed page
- New element
- Removed element
- Changed selector
- Changed flow

## Context

- CONTEXT.md generation
- Correct file references
- AGENTS.md generation
- Framework-specific context
- Historical change reports

## Framework

- Framework-independent output
- Playwright output
- Selenium Java output

## Integration

Create/use a local demo application containing:

- Navigation
- Forms
- Dropdowns
- Tabs
- Modals
- Tables
- Pagination
- Safe actions
- Destructive actions

Run the explorer against the demo application and verify the complete lifecycle.

---

# 28. Acceptance Criteria

## Resume

- [ ] Existing session can be selected.
- [ ] Existing application knowledge is loaded.
- [ ] User can resume exploration.
- [ ] Resume creates a new exploration run.
- [ ] New pages are detected.
- [ ] Removed pages are detected where possible.
- [ ] New elements are detected.
- [ ] Removed elements are detected where possible.
- [ ] Selector changes are detected.
- [ ] Flow changes are detected.
- [ ] Change report is generated.
- [ ] Current application context is updated.
- [ ] Previous runs remain available.

## Framework

- [ ] Framework selection is optional.
- [ ] Default is Framework Independent.
- [ ] Framework selection is stored with the session.
- [ ] Framework selection does not change exploration behavior.
- [ ] Framework-specific context is generated.
- [ ] Generic application model remains framework-neutral.

## Context

- [ ] CONTEXT.md is generated.
- [ ] CONTEXT.md references all generated files.
- [ ] User can provide only CONTEXT.md to a coding agent.
- [ ] AGENTS.md is generated.
- [ ] Historical change reports are retained.
- [ ] application.json remains machine-readable.

## Sessions

- [ ] Multiple applications can coexist.
- [ ] Sessions are isolated.
- [ ] Sessions survive application restart.
- [ ] A session can be resumed multiple times.
- [ ] Only one active exploration run is allowed per session.

---

# 29. Final End-to-End Workflow

The completed feature must support:

```text
1. User opens Application Explorer.

2. User enters:
   URL
   Optional username
   Optional password
   Optional framework

3. User clicks Start Exploring.

4. A new Application Session is created.

5. Existing exploration engine performs discovery.

6. UI shows live exploration events.

7. Exploration completes.

8. Application context is generated.

9. CONTEXT.md is generated.

10. User downloads the context directory.

11. User can provide only CONTEXT.md to:
    Cursor / Claude Code / Codex / Antigravity.

12. Application changes later.

13. User opens the existing Application Session.

14. User clicks Resume Exploration.

15. Existing application knowledge is loaded.

16. A new Exploration Run starts.

17. Agent re-explores the application.

18. New pages/elements are detected.

19. Removed pages/elements are detected where possible.

20. Selector and flow changes are detected.

21. A change report is generated.

22. Current application context is regenerated.

23. Historical exploration runs remain available.

24. User can switch to another application session.

25. Sessions remain completely isolated.
```

---

# 30. Product Principle

The product should ultimately provide this workflow:

```text
Explore
   ↓
Understand
   ↓
Persist
   ↓
Re-explore
   ↓
Detect Changes
   ↓
Update Context
   ↓
Give CONTEXT.md to Any Coding Agent
   ↓
Implement Automation
```

The SDET remains responsible for deciding what should become an automated test.

The Application Explorer's responsibility is to provide accurate, current, automation-ready application knowledge.
