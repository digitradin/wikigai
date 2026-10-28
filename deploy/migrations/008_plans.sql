-- My learning › Plans (v20261026): 2-step plans per profession. Idempotent.
-- Step 1 (outlook: key questions + 10 skills) is shared between users with the same
-- profession + language + age band + country, so it is cached once for everyone.
CREATE TABLE IF NOT EXISTS plan_outlook_cache (
    cache_key   TEXT PRIMARY KEY,
    profession  TEXT NOT NULL,
    lang        TEXT NOT NULL DEFAULT 'en',
    result      JSONB NOT NULL,
    model       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Step 2: the user's saved plans (outlook snapshot + chosen skills + detailed plan)
CREATE TABLE IF NOT EXISTS learning_plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profession  TEXT NOT NULL,
    lang        TEXT NOT NULL DEFAULT 'en',
    duration    TEXT NOT NULL CHECK (duration IN ('30d', '3m', '1y')),
    skills      JSONB NOT NULL,
    answers     JSONB,
    outlook     JSONB NOT NULL,
    plan        JSONB NOT NULL,
    model       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_plans_user ON learning_plans (user_id, created_at DESC);
-- fresh AI calls per user (daily limit); cached answers are not counted
CREATE TABLE IF NOT EXISTS plan_ai_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    provider    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plan_ai_log_user ON plan_ai_log (user_id, created_at DESC);
