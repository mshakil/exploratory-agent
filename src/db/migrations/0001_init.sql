CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL,
  username_lower  TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  salt            TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  email           TEXT,
  azure_oid       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (username_lower);
CREATE UNIQUE INDEX IF NOT EXISTS users_azure_oid_uq ON users (azure_oid) WHERE azure_oid IS NOT NULL;

CREATE TABLE IF NOT EXISTS exploration_sessions (
  id                          TEXT PRIMARY KEY,
  owner_user_id               TEXT NOT NULL REFERENCES users(id),
  application_name            TEXT NOT NULL,
  application_url             TEXT NOT NULL,
  target_username             TEXT,
  framework                   TEXT NOT NULL DEFAULT 'independent',
  status                      TEXT NOT NULL CHECK (status IN (
                                'created', 'initializing', 'exploring', 're-exploring',
                                'completed', 'failed', 'paused'
                              )),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at                  TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ,
  error                       TEXT,
  current_exploration_id      TEXT,
  stats_pages                 INT NOT NULL DEFAULT 0,
  stats_elements              INT NOT NULL DEFAULT 0,
  stats_actions               INT NOT NULL DEFAULT 0,
  stats_flows                 INT NOT NULL DEFAULT 0,
  stats_skipped               INT NOT NULL DEFAULT 0,
  context_relpath             TEXT NOT NULL,
  memory_relpath              TEXT NOT NULL,
  stability_profile           TEXT CHECK (stability_profile IS NULL OR stability_profile IN ('fast', 'balanced', 'deep')),
  auth_mode                   TEXT CHECK (auth_mode IS NULL OR auth_mode IN ('none', 'credentials', 'storage-state', 'manual-wait')),
  domain_allowlist            JSONB NOT NULL DEFAULT '[]'::jsonb,
  explore_open_shadow         BOOLEAN,
  explore_same_origin_frames  BOOLEAN,
  dismiss_consent             BOOLEAN,
  latest_changes              JSONB
);

CREATE INDEX IF NOT EXISTS exploration_sessions_owner_updated_idx
  ON exploration_sessions (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS exploration_sessions_status_idx
  ON exploration_sessions (status);

CREATE TABLE IF NOT EXISTS exploration_runs (
  id                    TEXT NOT NULL,
  session_id            TEXT NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL CHECK (type IN ('initial', 'resume')),
  started_at            TIMESTAMPTZ NOT NULL,
  completed_at          TIMESTAMPTZ,
  status                TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  statistics            JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_report_relpath TEXT,
  PRIMARY KEY (session_id, id)
);

CREATE TABLE IF NOT EXISTS exploration_events (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
  seq          BIGSERIAL NOT NULL,
  ts           TIMESTAMPTZ NOT NULL,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  metadata     JSONB,
  status       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS exploration_events_session_seq_uq
  ON exploration_events (session_id, seq);
CREATE INDEX IF NOT EXISTS exploration_events_session_seq_idx
  ON exploration_events (session_id, seq);
