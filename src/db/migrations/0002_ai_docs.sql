-- AI documentation preferences / last usage (tokens only; never API keys)
ALTER TABLE exploration_sessions
  ADD COLUMN IF NOT EXISTS doc_generation_mode TEXT,
  ADD COLUMN IF NOT EXISTS ai_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_usage JSONB;
