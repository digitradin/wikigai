-- My learning › Videos: saved "WikiVids" per user + a shared cache of filtered YouTube searches. Idempotent.
CREATE TABLE IF NOT EXISTS favorite_videos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id    TEXT NOT NULL,
    title       TEXT NOT NULL,
    channel     TEXT,
    thumb       TEXT,
    duration_s  INTEGER,
    views       BIGINT,
    domain      TEXT,
    query       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_favorite_videos_user ON favorite_videos (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS video_search_cache (
    cache_key   TEXT PRIMARY KEY,
    result      JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS video_search_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_search_log_user ON video_search_log (user_id, created_at DESC);
