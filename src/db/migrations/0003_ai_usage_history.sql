-- Historical AI usage records for comparing providers/models (tokens only; never API keys)
ALTER TABLE exploration_sessions
  ADD COLUMN IF NOT EXISTS ai_usage_history JSONB NOT NULL DEFAULT '[]'::jsonb;
