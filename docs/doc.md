# Application Exploration Agent

## 1. Project Overview

Build a standalone, framework-independent **Application Exploration Agent** for SDETs.

The agent's purpose is to autonomously explore an unfamiliar web application, discover its UI structure and reachable workflows, identify reliable selectors for interactive elements, maintain exploration memory, and generate structured application context that can be consumed by any coding agent or automation framework.

The product is **not an AI test generator**.

Its purpose is to eliminate the manual application reconnaissance work that an SDET normally performs before writing automation.

The primary workflow is:

```text
Unfamiliar Application
        ↓
Application Exploration Agent
        ↓
Application Knowledge
        ↓
Coding Agent
        ↓
SDET Automation
```

The agent must be executable independently from any particular coding assistant.

It must work as a normal CLI/tool that can be invoked by:

* Cursor
* Claude Code
* Codex
* Antigravity
* Other agentic IDEs
* Terminal
* CI/CD in the future

Do not build native integrations with individual coding agents in V1.

The coding agents should interact with the product through its CLI, generated files, and machine-readable output.

---

# 2. Core Product Principle

The agent discovers the application.

The SDET decides what to automate.

Do not turn the product into a general-purpose autonomous QA platform.

The MVP should focus exclusively on:

1. Application discovery
2. Safe UI exploration
3. Selector discovery
4. Flow discovery
5. Exploration memory
6. Framework-neutral application knowledge
7. Markdown/JSON output
8. CLI accessibility for coding agents

---

# 3. Problem Statement

When an SDET starts automation for an unfamiliar application, significant time is spent on reconnaissance:

* Understanding application navigation
* Discovering pages
* Finding interactive elements
* Understanding forms
* Understanding dropdowns and selections
* Identifying workflows
* Finding reliable selectors
* Understanding state changes
* Documenting discovered behavior

This work is repetitive and does not directly create automation.

The agent should automate this reconnaissance phase.

---

# 4. Target User

Primary user:

> SDET / Test Automation Engineer working with an unfamiliar web application.

Secondary user:

> Coding agent assisting the SDET with automation implementation.

The tool should be useful even when no coding agent is involved.

---

# 5. Product Experience

The intended experience is:

```text
Install Agent

    ↓

agent explore \
  --url https://application.example.com \
  --start /dashboard

    ↓

Agent opens browser

    ↓

Agent explores application

    ↓

Agent builds application model

    ↓

Agent saves knowledge

    ↓

Agent generates documentation

    ↓

SDET or coding agent consumes the generated context
```

The user should provide minimal information.

Required input:

* Application URL
* Authentication/session information or an authenticated browser session
* Starting URL/page

Optional input:

* Exploration boundaries
* Environment configuration
* Test data
* Exploration depth
* Action safety mode

---

# 6. Important Scope Decision

V1 targets **web applications only**.

Do not implement native Android/iOS exploration in V1.

Do not implement API exploration in V1.

Do not implement desktop application exploration in V1.

The architecture should not prevent future expansion, but the implementation must remain focused on web applications.

---

# 7. Core Capabilities

## 7.1 Page Discovery

The agent must discover reachable application pages/states.

Record:

* URL
* Page title
* Page name
* Page type
* Parent page/state
* How the page was reached
* Timestamp
* Exploration status

Example:

```json
{
  "id": "users",
  "name": "Users",
  "url": "/users",
  "reachedBy": {
    "action": "click",
    "element": "Users"
  }
}
```

---

# 8. Element Discovery

Discover interactive UI elements.

At minimum support:

* Button
* Link
* Input
* Textarea
* Select
* Dropdown
* Checkbox
* Radio button
* Tab
* Menu
* Modal/dialog
* Table
* Pagination controls

Capture:

```text
Element
├── Name
├── Type
├── Text
├── Accessible name
├── Role
├── Attributes
├── Selector candidates
├── Preferred selector
├── Fallback selectors
├── Page
└── Confidence
```

---

# 9. Selector Intelligence

Selector discovery is a core feature.

The agent must not simply capture the first CSS selector it finds.

It should generate and rank selector candidates.

Preferred hierarchy should generally favor:

1. Test IDs
2. Stable accessibility attributes
3. Stable semantic attributes
4. Name attributes
5. Role + accessible name
6. Stable IDs
7. Stable CSS selectors
8. XPath only when necessary

Avoid brittle selectors such as:

```text
:nth-child()
```

deep DOM paths:

```text
div > div > div > button
```

or generated framework-specific selectors.

The selector model must remain framework-neutral.

Example:

```json
{
  "element": "Save User",
  "type": "button",
  "semantic": {
    "role": "button",
    "accessibleName": "Save User"
  },
  "attributes": {
    "testId": "save-user"
  },
  "selectors": {
    "preferred": {
      "strategy": "testId",
      "value": "save-user"
    },
    "fallbacks": [
      {
        "strategy": "role",
        "role": "button",
        "name": "Save User"
      },
      {
        "strategy": "ariaLabel",
        "value": "Save User"
      }
    ]
  },
  "confidence": "high"
}
```

Do not generate Playwright/Selenium/Cypress code as the primary representation.

---

# 10. Safe Exploration

The agent should behave like an exploratory SDET.

It must not blindly click every discovered element.

Actions should be classified into:

### Safe actions

Examples:

* Navigation
* Open menu
* Open dialog
* Expand section
* Switch tab
* Select dropdown option
* Enter test data
* Apply filter
* Sort
* Pagination
* Change view

### Potentially destructive actions

Examples:

* Delete
* Remove
* Publish
* Send
* Purchase
* Transfer
* Submit irreversible transaction
* Logout
* Cancel critical operation

V1 behavior:

* Automatically execute safe actions.
* Skip potentially destructive actions by default.
* Record skipped actions.
* Allow explicit configuration to enable additional action categories later.

Do not build a sophisticated AI safety system.

A simple deterministic rule-based classifier is sufficient.

---

# 11. Exploration Loop

The core exploration algorithm should follow this pattern:

```text
Discover current state
        ↓
Discover interactive elements
        ↓
Classify actions
        ↓
Find unexplored safe action
        ↓
Execute action
        ↓
Observe resulting state
        ↓
Capture new elements
        ↓
Generate/update selectors
        ↓
Update application graph
        ↓
Persist memory
        ↓
Continue until no unexplored safe states remain
```

The agent must detect already visited states and avoid repeatedly exploring the same state.

---

# 12. Application State

Do not assume that URL alone defines a unique state.

A web application may have:

```text
/users
```

with different UI states depending on:

* Modal opened
* Tab selected
* Filter applied
* Dropdown opened
* Form state
* Pagination
* Application data

The implementation should use a practical state fingerprint.

The fingerprint may combine:

* URL
* Page title
* Visible interactive elements
* Relevant DOM structure
* Selected tab/view
* Modal state

Do not build an advanced state-space engine for V1.

The objective is simply to prevent obvious duplicate exploration.

---

# 13. Application Graph

Maintain an internal application graph.

Example:

```text
Login
  ↓
Dashboard
  ├── Users
  │     ├── User List
  │     ├── Create User
  │     └── User Details
  │
  ├── Reports
  │
  └── Settings
```

Each transition should contain:

```json
{
  "from": "user-list",
  "action": {
    "type": "click",
    "element": "Create User"
  },
  "to": "create-user"
}
```

The graph is primarily used for:

* Exploration
* Duplicate-state detection
* Flow discovery
* Documentation

Do not implement a separate graph database.

A simple in-memory graph persisted to JSON is sufficient.

---

# 14. Flow Discovery

The agent should identify representative workflows from exploration.

Example:

```text
Create User

1. Navigate to Users
2. Click Create User
3. Enter Name
4. Select Country
5. Select Role
6. Click Save
7. Return to User List
```

Flows should contain:

* Name
* Preconditions if known
* Steps
* Actions
* Elements
* Selectors
* Resulting state
* Observed outcome

Do not attempt to generate exhaustive test cases.

A discovered flow is an **application behavior/context artifact**, not a test case.

---

# 15. Dropdown and Option Exploration

For selectable controls:

```text
Country
├── Pakistan
├── UAE
├── UK
└── USA
```

The agent should discover available options.

It should select representative options while avoiding unnecessary combinatorial explosion.

Do not attempt:

```text
10 dropdowns × 20 options × 10 states
```

The exploration strategy should prioritize discovery over exhaustive combinatorial testing.

The objective is:

> Understand what the control contains and how it behaves.

Not:

> Test every possible combination.

---

# 16. Forms

For forms, the agent should discover:

* Fields
* Field types
* Labels
* Names
* Required indicators when detectable
* Available options
* Submit controls
* Cancel controls
* Validation behavior encountered during exploration

Use safe synthetic test data.

Do not infer or generate realistic sensitive personal data.

Provide configurable test-data values.

---

# 17. Authentication

V1 should support:

### Option A — Existing authenticated session

Preferred approach.

Example:

```text
agent explore --storage-state ./auth.json
```

### Option B — Simple credentials

Allow configurable username/password input.

Do not attempt to automatically solve:

* CAPTCHA
* MFA
* Hardware keys
* Complex enterprise SSO

If authentication cannot be automated, allow the user to authenticate manually and then continue exploration.

The goal is minimal human interaction, not zero human interaction.

---

# 18. Memory

Memory must be simple and persistent.

V1 should use either:

* JSON files, or
* SQLite

Prefer JSON initially unless querying becomes difficult.

Example:

```text
.memory/
├── pages.json
├── elements.json
├── flows.json
├── selectors.json
└── exploration.json
```

Memory should record:

* Visited states
* Discovered pages
* Discovered elements
* Executed actions
* Skipped actions
* Selectors
* Flows
* Last exploration timestamp

Do not implement:

* Vector database
* Embeddings
* RAG
* Semantic memory framework

unless a later requirement demonstrates the need.

---

# 19. Generated Output

After exploration, generate:

```text
application-context/
├── application.md
├── pages.md
├── flows.md
├── selectors.md
└── application.json
```

## application.md

High-level application overview.

Example:

```markdown
# Application

## Pages

- Login
- Dashboard
- Users
- Reports
- Settings

## Discovered Areas

- User Management
- Reporting
- Configuration
```

## pages.md

Describe discovered pages and elements.

## flows.md

Describe discovered workflows.

## selectors.md

Provide reusable selector information.

## application.json

Machine-readable source of truth.

---

# 20. Machine-Readable Output

The JSON output is critical because coding agents should not have to parse Markdown to understand the application.

Example:

```json
{
  "application": {
    "name": "Example Application",
    "baseUrl": "https://example.com"
  },
  "pages": [],
  "elements": [],
  "flows": [],
  "selectors": [],
  "exploration": {
    "startedAt": "",
    "completedAt": "",
    "status": "completed"
  }
}
```

The JSON schema should be versioned.

Example:

```json
{
  "schemaVersion": "1.0"
}
```

---

# 21. Coding Agent Compatibility

This is a core requirement.

The tool must be executable by any coding agent that can execute terminal commands.

Target compatibility:

* Cursor
* Claude Code
* Codex
* Antigravity
* Other agentic IDEs
* Standard terminal

Do not create provider-specific integrations in V1.

The interface should be:

```bash
agent-explorer explore \
  --url https://example.com \
  --start /dashboard
```

The coding agent can then inspect:

```text
application-context/
```

and use it as context for implementation.

---

# 22. Coding Agent Workflow

The intended workflow is:

```text
SDET:

"Explore this application."

        ↓

Coding Agent executes:

agent-explorer explore \
  --url https://example.com

        ↓

Explorer generates:

application-context/

        ↓

Coding Agent reads:

application.md
pages.md
flows.md
selectors.md
application.json

        ↓

SDET:

"Create Playwright automation for Create User."

        ↓

Coding Agent uses application context

        ↓

Automation code generated
```

The explorer should therefore be **agent-callable**, not agent-dependent.

---

# 23. CLI Design

The CLI should be small.

Suggested commands:

```bash
agent-explorer explore
```

Start an exploration.

```bash
agent-explorer resume
```

Continue interrupted exploration.

```bash
agent-explorer status
```

Show current exploration state.

```bash
agent-explorer report
```

Generate/re-generate documentation from stored knowledge.

```bash
agent-explorer inspect
```

Inspect discovered application knowledge.

Do not implement unnecessary commands.

---

# 24. Example CLI

```bash
agent-explorer explore \
  --url https://example.com \
  --start /dashboard \
  --output ./application-context
```

Authenticated session:

```bash
agent-explorer explore \
  --url https://example.com \
  --storage-state ./auth.json \
  --output ./application-context
```

Safe exploration should be the default.

---

# 25. CLI Output

Example:

```text
Application Explorer

Starting exploration...
URL: https://example.com

✓ Browser initialized
✓ Application loaded
✓ Authentication detected

Exploring...

Pages discovered:       12
Elements discovered:    94
Flows discovered:        9
Selectors captured:     87

Skipped actions:         4
Blocked states:          1

Exploration completed.

Output:
./application-context/application.md
./application-context/pages.md
./application-context/flows.md
./application-context/selectors.md
./application-context/application.json
```

The CLI should also support machine-readable output:

```bash
agent-explorer explore --json
```

This allows coding agents to consume status programmatically.

---

# 26. Coding-Agent Instructions

Include a small generated file:

```text
application-context/AGENTS.md
```

This file should explain how a coding agent should consume the generated knowledge.

Example:

```markdown
# Application Context

This directory contains automatically discovered application knowledge.

Before implementing automation:

1. Read application.md.
2. Read pages.md.
3. Read flows.md.
4. Read selectors.md.
5. Use application.json when structured information is required.

Selectors in selectors.md represent discovered selector strategies.

Do not assume that every discovered flow is a test case.

Use the discovered application context as the source of truth for UI structure.
```

This makes the output naturally consumable by Cursor, Claude Code, Codex, Antigravity, and similar tools.

---

# 27. AI Usage

AI should be optional and targeted.

Use deterministic code for:

* DOM discovery
* Element discovery
* Selector generation
* Selector ranking
* Browser interaction
* State detection
* Graph creation
* Duplicate detection
* Memory persistence

Use an LLM only where reasoning adds clear value:

* Flow naming
* Page summarization
* Element semantic interpretation
* Documentation generation
* Ambiguous UI interpretation

The application must remain functional without an LLM for core browser exploration.

---

# 28. Technology Stack

Recommended V1:

```text
Language:       TypeScript
Runtime:        Node.js
Browser:        Playwright
Storage:        JSON initially
CLI:            Commander / equivalent
Validation:     Zod / equivalent
Testing:        Vitest
Documentation:  Markdown
Build:          TypeScript
```

Keep dependencies minimal.

Do not introduce:

* Kubernetes
* Redis
* Kafka
* Vector DB
* Microservices
* Separate backend service
* Cloud infrastructure

The first version should be a local developer tool.

---

# 29. Architecture

Use a modular monolith.

```text
src/
├── cli/
├── explorer/
├── browser/
├── discovery/
├── selectors/
├── state/
├── graph/
├── memory/
├── flows/
├── documentation/
├── ai/
└── models/
```

Suggested responsibilities:

### browser/

Browser abstraction and Playwright implementation.

### discovery/

Page and element discovery.

### selectors/

Selector candidate generation and ranking.

### state/

Application state fingerprinting.

### graph/

Application exploration graph.

### flows/

Flow extraction.

### memory/

Persistence and retrieval.

### documentation/

Markdown and JSON generation.

### ai/

Optional LLM functionality.

### models/

Framework-neutral domain models.

---

# 30. Important Architectural Rule

The core domain must not depend directly on Playwright.

Use an abstraction:

```typescript
interface BrowserAdapter {
  navigate(url: string): Promise<void>;
  getCurrentUrl(): Promise<string>;
  getPageTitle(): Promise<string>;
  getInteractiveElements(): Promise<ElementSnapshot[]>;
  click(element: ElementReference): Promise<ActionResult>;
  type(element: ElementReference, value: string): Promise<ActionResult>;
  select(element: ElementReference, value: string): Promise<ActionResult>;
  getState(): Promise<PageState>;
}
```

Playwright implements this interface.

This ensures the exploration model remains framework-independent.

Do not build Selenium/Cypress adapters in V1 unless required.

---

# 31. Domain Model

Create clear domain entities.

Minimum:

```text
Application
Page
Element
Selector
Action
Flow
State
ExplorationSession
```

Relationships:

```text
Application
    ↓
Pages
    ↓
Elements
    ↓
Actions
    ↓
States
    ↓
Flows
```

---

# 32. Exploration Boundaries

The agent needs basic controls.

Support:

```text
maxPages
maxActionsPerPage
maxDepth
timeout
excludedUrls
excludedActions
```

Example:

```bash
agent-explorer explore \
  --url https://example.com \
  --max-pages 50 \
  --max-depth 8
```

Defaults should be conservative.

Do not attempt infinite exploration.

---

# 33. Failure Handling

The agent must never stop the entire exploration because one element fails.

Example:

```text
Element: Export
Action: Click
Result: Timeout

Status:
SKIPPED

Reason:
Element interaction timed out
```

Continue exploring other available elements.

All failures should be recorded.

---

# 34. Exploration Status

Each action should have a status:

```text
DISCOVERED
PENDING
EXECUTED
SKIPPED
FAILED
BLOCKED
```

Each page/state should have:

```text
DISCOVERED
EXPLORING
COMPLETED
BLOCKED
FAILED
```

This makes the exploration resumable.

---

# 35. Resumability

If the process stops unexpectedly:

```bash
agent-explorer resume
```

should continue from persisted exploration state.

This is important because real applications may take significant time to explore.

Do not lose the entire exploration because the process crashed.

---

# 36. Logging

Provide concise operational logs.

Example:

```text
[DISCOVER] Users
[DISCOVER] 14 interactive elements
[ACTION] Click Create User
[STATE] Create User
[SELECTOR] Save User → testId:save-user
[ACTION] Select Country: UAE
[STATE] Create User
[SKIP] Delete User → destructive action
```

Support:

```bash
--verbose
```

for detailed debugging.

---

# 37. Testing Requirements

The implementation must contain unit and integration tests.

Test at minimum:

### Selector ranking

Given multiple candidates, verify that stable selectors are preferred.

### State fingerprinting

Equivalent states should produce equivalent fingerprints.

### Duplicate detection

Previously explored states should not be explored again.

### Action classification

Safe/destructive classification should behave deterministically.

### Memory

Verify persistence and restoration.

### Graph

Verify pages and transitions are correctly represented.

### Documentation

Verify Markdown and JSON are generated correctly.

### Browser integration

Create a small local demo application and run the explorer against it.

Do not depend on an external public application for tests.

---

# 38. Demo Application

Create a small local web application specifically for integration testing.

It should contain:

```text
Login
Dashboard
Users
Create User
Edit User
Reports
Settings
Dropdown
Checkboxes
Radio buttons
Modal
Table
Pagination
Safe actions
Destructive actions
```

The explorer should be able to discover it automatically.

This demo application becomes the primary end-to-end test environment.

---

# 39. Security

Do not log:

* Passwords
* Authentication tokens
* Cookies
* API keys
* Session secrets

Mask sensitive values in logs and generated documentation.

Test data should be configurable.

The application context should never contain raw credentials.

---

# 40. Non-Goals

The following are explicitly outside V1:

```text
❌ Automated test generation
❌ Test case management
❌ Bug generation
❌ Requirement generation
❌ API testing
❌ Native mobile testing
❌ Self-healing automation
❌ Jira integration
❌ CI/CD integration
❌ Cloud execution
❌ Multi-agent orchestration
❌ Vector database
❌ RAG
❌ Embedding-based memory
❌ Framework-specific code generation
❌ Exhaustive combinatorial testing
```

---

# 41. V1 Success Criteria

The MVP is successful if an SDET can provide:

```text
Application URL
+
Authentication/session
+
Starting point
```

and the agent can autonomously:

```text
✓ Discover reachable pages
✓ Discover interactive elements
✓ Explore safe actions
✓ Discover representative flows
✓ Generate reliable selector candidates
✓ Avoid repeated states
✓ Persist exploration state
✓ Generate application context
✓ Generate Markdown documentation
✓ Generate machine-readable JSON
✓ Be executed from a terminal
✓ Be invoked by Cursor
✓ Be invoked by Claude Code
✓ Be invoked by Codex
✓ Be invoked by Antigravity
```

The strongest success metric is:

> **How much reconnaissance time does the agent remove from an SDET's workflow?**

Not the number of AI calls.

Not the number of generated tests.

Not the number of agents.

---

# 42. Future Roadmap

## V1 — Application Discovery

```text
Web exploration
Selector discovery
Flow discovery
Memory
Markdown
JSON
CLI
Coding-agent compatibility
```

## V2 — Application Change Intelligence

```text
Re-exploration
Application diff
Selector changes
New pages
Removed pages
Changed flows
Exploration comparison
```

## V3 — Automation Assistance

```text
Framework adapters
Test generation
Page object generation
Locator generation
Automation scaffolding
```

## V4 — Broader Platform

Potential future capabilities:

```text
Native mobile exploration
API discovery
CI/CD
Cloud execution
Advanced AI reasoning
Team knowledge sharing
```

Do not implement future phases until the preceding phase demonstrates value.

---

# 43. Definition of Done for V1

The implementation is complete when:

* [ ] The project runs locally with a single setup command.
* [ ] CLI can start an exploration.
* [ ] Playwright browser adapter works.
* [ ] User can provide URL and authentication/session.
* [ ] Agent discovers pages.
* [ ] Agent discovers interactive elements.
* [ ] Agent generates selector candidates.
* [ ] Agent ranks selectors.
* [ ] Agent classifies safe/destructive actions.
* [ ] Agent executes safe actions.
* [ ] Agent detects resulting states.
* [ ] Agent builds an application graph.
* [ ] Agent avoids duplicate states.
* [ ] Agent records discovered flows.
* [ ] Agent persists memory.
* [ ] Agent can resume exploration.
* [ ] Agent generates application.md.
* [ ] Agent generates pages.md.
* [ ] Agent generates flows.md.
* [ ] Agent generates selectors.md.
* [ ] Agent generates application.json.
* [ ] Agent generates AGENTS.md.
* [ ] CLI supports machine-readable output.
* [ ] Local demo application exists.
* [ ] End-to-end tests run against the demo application.
* [ ] Credentials/secrets are not written to output.
* [ ] Cursor can invoke the CLI.
* [ ] Claude Code can invoke the CLI.
* [ ] Codex can invoke the CLI.
* [ ] Antigravity can invoke the CLI.
* [ ] README explains installation and usage.

---

# 44. Final Product Definition

The final product should be understood as:

> **A standalone application reconnaissance agent for SDETs. It autonomously explores web applications, discovers their UI structure, reachable workflows, interactive elements, and reliable selectors, remembers what it has discovered, and produces framework-neutral Markdown and JSON application context. Any coding agent—including Cursor, Claude Code, Codex, and Antigravity—can invoke the agent through its CLI and consume the resulting context to implement automation.**

The product does not attempt to replace the SDET.

It removes the reconnaissance phase so the SDET can start automation with an already-understood application.

## Core principle

```text
Explore once.
Understand the application.
Persist the knowledge.
Let any coding agent use it.
Let the SDET decide what to automate.
```