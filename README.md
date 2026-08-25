# Application Exploration Agent

Standalone, framework-independent **application reconnaissance agent** for SDETs.

It explores an unfamiliar web application, discovers pages, interactive elements, safe workflows, and reliable selector candidates, then writes framework-neutral Markdown and JSON that any coding agent (Cursor, Claude Code, Codex, Antigravity, or a plain terminal) can consume.

Optional framework selection adds Playwright or Selenium Java documentation on top of the same neutral model. Sessions can be resumed to re-explore and detect changes.

> The agent discovers the application. The SDET decides what to automate.

## Setup

```bash
npm run setup
```

This installs dependencies, Playwright Chromium, and builds the CLI.

Or step by step:

```bash
npm install
npx playwright install chromium
npm run build
```

## Quick start

```bash
# Explore any web app (CLI)
npx agent-explorer explore --url https://example.com --start /dashboard

# Or open the multi-session live UI
npm run ui
# → http://127.0.0.1:3847

# Or against the included demo app (in another terminal: npx serve demo -l 4173)
npx serve demo -l 4173
npx agent-explorer explore --url http://127.0.0.1:4173 --username explorer --password demo
```

Authenticated Playwright session:

```bash
npx agent-explorer explore \
  --url https://example.com \
  --storage-state ./auth.json \
  --output ./application-context
```

## Live UI

`npm run ui` starts a multi-application exploration canvas:

- Enter URL, optional credentials, and framework (Independent, Playwright, Selenium Java)
- Watch live discovery (pages, elements, actions, flows, ETA)
- Open the **Graph** tab to inspect the application state graph (pages + transitions), with zoom and page details
- Download `CONTEXT.md`, individual docs, or a full zip
- Resume a completed session to re-explore and review change reports
- Dark / light theme (persisted in the browser)

Passwords are never persisted. Framework selection only affects generated documentation.

After changing server code, restart `npm run ui` so new API routes (such as `/api/sessions/:id/graph`) are loaded.

## CLI

| Command | Purpose |
|---|---|
| `agent-explorer explore` | Start exploration |
| `agent-explorer ui` | Multi-session live exploration UI |
| `agent-explorer resume` | Continue from `.memory/` |
| `agent-explorer status` | Show exploration progress |
| `agent-explorer report` | Regenerate docs from memory |
| `agent-explorer inspect` | Inspect discovered pages/elements |

Common options:

```text
--url <url>                 Application URL (required for explore)
--start <path>              Starting path
--output <dir>              Default: ./application-context
--memory <dir>              Default: ./.memory
--storage-state <file>      Playwright storage state
--username / --password     Simple credential login
--max-pages <n>             Default: 50
--max-depth <n>             Default: 8
--max-duration <ms>         Wall-clock budget (default: 300000)
--headed                    Show the browser
--json                      Machine-readable summary
--verbose                   Detailed logs
```

## Output

```text
application-context/
├── CONTEXT.md              # Entry point for coding agents
├── AGENTS.md
├── application.md
├── pages.md
├── flows.md
├── selectors.md
├── application.json
├── framework/              # When a framework is selected
│   ├── playwright.md
│   └── selenium-java.md
└── changes/                # After resume / re-exploration
    └── exploration-001.md
```

`CONTEXT.md` is the parent document — hand this file (or the folder) to a coding agent.  
`application.json` is the machine-readable source of truth (`schemaVersion: "1.0"`).  
`AGENTS.md` explains how to consume the context and any framework-specific files.

Sessions from the UI are stored under `data/sessions/` (gitignored), including memory, documents, events, and exploration runs.

## Coding-agent workflow

1. Ask your coding agent to explore the app (CLI or UI).
2. It runs `agent-explorer explore --url ...` or starts a UI session.
3. Point the agent at `CONTEXT.md` (or the full `application-context/` folder).
4. Ask it to implement automation for a chosen flow, using framework docs when present.

The explorer is **agent-callable**, not agent-dependent.

## Safety

By default the agent:

- Executes **safe** actions (navigation, tabs, filters, form fills with synthetic data, etc.)
- **Skips** destructive actions (delete, publish, logout, transfer, purchase, …)
- Continues after individual interaction failures
- Masks credentials/secrets in logs and generated output

## Architecture

```text
src/
├── cli/             Commander CLI
├── explorer/        Exploration loop (+ change events)
├── browser/         BrowserAdapter + Playwright implementation
├── discovery/       Page/element discovery + action classification
├── selectors/       Candidate generation and ranking
├── state/           State fingerprinting
├── graph/           Application graph (pages + transitions)
├── memory/          JSON persistence
├── sessions/        Multi-app sessions, runs, resume (+ graph API)
├── server/          HTTP + SSE UI server
├── flows/           Flow extraction
├── changes/         Diff previous vs current context
├── frameworks/      Playwright / Selenium Java doc generators
├── documentation/   Markdown + JSON + CONTEXT.md
├── ai/              Optional LLM hooks (noop by default)
└── models/          Domain models (Zod)
ui/                  Live exploration canvas (static; includes Graph tab)
data/sessions/       Persisted multi-app exploration sessions
```

The in-memory `ApplicationGraph` stores discovered UI states as nodes and state-changing actions as edges. The UI Graph tab reads the same data from session memory (with a fallback to `application.json`).

Core domain code depends on `BrowserAdapter`, not Playwright directly.  
The application model stays framework-neutral; framework generators only map selectors into docs.

## Demo application

`demo/index.html` is a small CRM used for integration tests:

Login, Dashboard (tabs + modal), Users (table, pagination, create/edit), Reports, Settings, safe and destructive actions.

## Tests

```bash
npm test
```

Includes unit tests for selectors, state fingerprints, action classification, memory, graph, documentation, change detection, and sessions, plus an end-to-end exploration against the local demo app.

## Non-goals (V1)

Automated test generation, API/mobile exploration, self-healing, cloud execution, and vector/RAG memory are out of scope. Framework generators produce documentation only — they do not emit runnable test suites.
