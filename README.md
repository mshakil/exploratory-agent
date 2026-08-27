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

**PostgreSQL is required** for both the UI and CLI (users, sessions, runs, events). Artifacts stay on disk under `AE_DATA_DIR`.

```bash
npm run db:up          # Docker Compose Postgres 16
cp .env.example .env   # set DATABASE_URL / AE_SESSION_SECRET
node scripts/ensure-db.mjs   # create DB if missing
npm run db:migrate
```

See [docs/postgres.md](docs/postgres.md) for schema, legacy JSON import, and ops details.

Or step by step without Docker (bring your own Postgres):

```bash
npm install
npx playwright install chromium
# set DATABASE_URL in .env
npm run db:migrate
npm run build
```

## Quick start

```bash
# Explore any web app (CLI) — creates a Postgres session + artifacts under ./data
npx agent-explorer explore --url https://example.com --start /dashboard

# Or open the multi-session live UI
npm run ui
# → http://127.0.0.1:3847

# Or against the included demo app (in another terminal: npx serve demo -l 4173)
npx serve demo -l 4173
npx agent-explorer explore --url http://127.0.0.1:4173 --username explorer --password demo
```

Authenticated Playwright session (target app):

```bash
npx agent-explorer explore \
  --url https://example.com \
  --storage-state ./auth.json
```

## Live UI

`npm run ui` starts a multi-user, multi-application exploration canvas:

- **Sign in / register** — each explorer account owns its sessions; multiple users can run explorations in parallel
- Enter URL, optional target-app credentials, stability profile, and framework (Independent, Playwright, Selenium Java)
- Watch live discovery (pages, elements, actions, flows, skip reasons, ETA)
- Pause / resume / stop; delete session or remove generated context
- Download `CONTEXT.md`, individual docs, or a full zip
- Resume a completed session to re-explore and review change reports
- Dark / light theme (icon toggle; persisted in the browser)

Passwords for **target apps** are never persisted. Explorer account passwords are stored as scrypt hashes in Postgres (`users` table).

### Multi-user / LAN

```bash
# Bind for LAN access (default is 127.0.0.1)
npm run ui -- --host 0.0.0.0 --port 3847
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | **Required.** Postgres connection string |
| `AE_DATA_DIR` | Artifact root for memory + application-context (default `./data`) |
| `AE_SESSION_SECRET` | HMAC secret for login cookies (≥16 chars; required in production) |
| `AE_COOKIE_SECURE=1` | Force `Secure` cookie flag (use behind HTTPS) |
| `AE_CORS_ORIGIN` | Allowed browser Origin for credentialed CORS (optional) |
| `AE_CLI_USER_ID` | Optional owner user id for CLI explores (else auto-created `cli` user) |
| `AZURE_AD_*` / `AE_PUBLIC_BASE_URL` | Reserved for Azure AD SSO (routes stubbed until implemented) |

The first registered account becomes **admin** and can see all sessions. Regular users only see their own.

After changing server code, restart `npm run ui` so new API routes are loaded.

## CLI

| Command | Purpose |
|---|---|
| `agent-explorer explore` | Start exploration (Postgres session) |
| `agent-explorer ui` | Multi-session live exploration UI |
| `agent-explorer resume --session <id>` | Re-explore an existing session |
| `agent-explorer status [--session <id>]` | List sessions or show one |
| `agent-explorer report --session <id>` | Regenerate docs from session memory |
| `agent-explorer inspect --session <id>` | Inspect discovered pages/elements |

Common options:

```text
--url <url>                 Application URL (required for explore)
--start <path>              Starting path (merged into URL)
--data <dir>                Artifact directory (default: AE_DATA_DIR or ./data)
--session <id>              Session id (resume / status / report / inspect)
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

Hybrid storage — metadata in Postgres, artifacts on disk:

```text
data/sessions/<session-id>/
├── memory/                 # Crawl snapshot (JSON)
└── application-context/
    ├── CONTEXT.md          # Entry point for coding agents
    ├── AGENTS.md
    ├── application.md
    ├── pages.md
    ├── flows.md
    ├── selectors.md
    ├── application.json
    ├── framework/          # Optional framework-specific docs
    └── changes/            # Resume change reports
```

Hand `CONTEXT.md` (or the folder) to a coding agent. Metadata (users, sessions, runs, events) lives in PostgreSQL — not in `session.json` / `events.json`.

## Resume

**Resume** continues from saved session memory (visited pages + prior actions), prefers unfinished / new areas, and still writes a change report against the previous `application.json`. If the session used target-app credentials, the UI prompts for the password again (passwords are never stored).

## AI documentation (BYOK)

Documentation defaults to **System** (deterministic templates from `application.json`).

Optionally choose **AI** output and bring your own key (OpenAI, Anthropic, or Azure OpenAI). The **docs** module rewrites markdown files; `application.json` stays system-generated. API keys are sent only for generation requests and are **never** stored in Postgres. After generation, the UI shows prompt/completion/total tokens and an estimated USD cost (estimate only).

Enrich / explore-hints modules are scaffolded for later.

## Safety

By default the agent:

- Executes **safe** actions (navigation, tabs, filters, form fills with synthetic data, etc.)
- **Skips** destructive actions (delete, publish, logout, transfer, purchase, …) and records skip reasons
- Continues after individual interaction failures
- Masks credentials/secrets in logs and generated output

## Hardening

See [docs/hardening-real-apps.md](docs/hardening-real-apps.md) for stability profiles, skip reasons, consent dismissal, and target-app auth modes (`credentials` / `storage-state` / `manual-wait`). Explorer-user login is separate — see [docs/postgres.md](docs/postgres.md).

UI mockup reference: [docs/hardening-ui-final-mockup.html](docs/hardening-ui-final-mockup.html).

## Tests

```bash
# Requires DATABASE_URL (Postgres tests skip if unreachable)
npm test
```

## License

MIT
