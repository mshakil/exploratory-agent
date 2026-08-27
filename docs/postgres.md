# PostgreSQL integration

Application Explorer uses **PostgreSQL** as the source of truth for users, exploration sessions, runs, and live events. Session **artifacts** (memory snapshots and generated application-context docs) remain on the filesystem under `AE_DATA_DIR`.

## Quick start

```bash
# Start Postgres 16
npm run db:up
# or: docker compose up -d postgres

cp .env.example .env
# DATABASE_URL=postgres://ae:ae@127.0.0.1:5432/agent_explorer

npm run db:migrate
npm run ui
```

## Schema (hybrid)

| Table | Purpose |
|-------|---------|
| `users` | Explorer accounts (scrypt hash + salt, roles) |
| `exploration_sessions` | Session metadata, ownership, stats, hardening flags |
| `exploration_runs` | Initial / resume run history |
| `exploration_events` | Append-only live event stream |

On disk (`AE_DATA_DIR/sessions/<id>/`):

- `memory/` — crawl snapshot JSON
- `application-context/` — Markdown + `application.json` for coding agents

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | yes | Postgres connection string |
| `AE_DATA_DIR` | no | Artifact root (default `./data`) |
| `AE_SESSION_SECRET` | prod | Cookie HMAC (≥16 chars); ephemeral if unset in non-prod |
| `AE_CLI_USER_ID` | no | Owner user id for CLI explores (else auto `cli` user) |

## CLI

```bash
# Creates a DB session owned by the cli user; writes artifacts under AE_DATA_DIR
npx agent-explorer explore --url http://127.0.0.1:4173 --username explorer --password demo

npx agent-explorer status
npx agent-explorer status --session session-...
npx agent-explorer resume --session session-...
npx agent-explorer report --session session-...
npx agent-explorer inspect --session session-...
```

## Import legacy JSON

If you previously used `data/users/users.json` and `data/sessions/*/session.json`:

```bash
npm run db:import-json -- --data ./data
```

JSON files are left in place as a backup. Memory and application-context directories are reused as-is.

## Tests

Postgres-backed unit tests skip unless `DATABASE_URL` is set:

```bash
set DATABASE_URL=postgres://ae:ae@127.0.0.1:5432/agent_explorer
npm test
```
