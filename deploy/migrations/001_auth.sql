-- CPS (Career Positioning System) — Auth + Users schema
-- Applied idempotently at startup by lib/migrate.js.
-- Self-sufficient: creates legacy + auth tables so it works even if
-- init-db.sql did not run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Legacy email-keyed results table (continuity with earlier app) ──
CREATE TABLE IF NOT EXISTS user_results (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email  TEXT NOT NULL,
    user_name   TEXT NOT NULL DEFAULT '',
    stage       INTEGER NOT NULL DEFAULT 1,
    results     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_results_email ON user_results(user_email);

-- ── Users ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash      TEXT UNIQUE NOT NULL,
    email_enc       BYTEA,
    name            TEXT NOT NULL DEFAULT '',
    locale          TEXT NOT NULL DEFAULT 'en',
    email_verified  BOOLEAN NOT NULL DEFAULT false,
    provider        TEXT NOT NULL DEFAULT 'password',
    provider_id     TEXT,
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','disabled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);

-- ── Verification / login PINs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_pins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash      TEXT NOT NULL,
    pin_hash        TEXT NOT NULL,
    purpose         TEXT NOT NULL DEFAULT 'signup'
                        CHECK (purpose IN ('signup','login')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    consumed        BOOLEAN NOT NULL DEFAULT false,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_pins_email ON auth_pins(email_hash, purpose);

-- ── Captcha challenges (server-side truth) ────────────────────────
CREATE TABLE IF NOT EXISTS captcha_challenges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_hash     TEXT NOT NULL,
    consumed        BOOLEAN NOT NULL DEFAULT false,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Link user_results to users (nullable — legacy rows have no user) ──
ALTER TABLE user_results ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_user_results_user_id ON user_results(user_id);
