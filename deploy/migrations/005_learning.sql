-- My learning › Plans: AI research results saved per user (idempotent).
CREATE TABLE IF NOT EXISTS learning_research (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic       TEXT NOT NULL,
    topic_key   TEXT NOT NULL,
    lang        TEXT NOT NULL DEFAULT 'en',
    result      JSONB NOT NULL,
    model       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_research_user ON learning_research (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_research_key ON learning_research (user_id, topic_key, lang, created_at DESC);
