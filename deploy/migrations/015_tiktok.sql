-- v20261112b: "Continue with TikTok" + linked sign-in methods + "Share to TikTok". Idempotent.
-- (1) accounts created with TikTok have no email until the user adds one
ALTER TABLE users ALTER COLUMN email_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_prompt_dismissals INTEGER NOT NULL DEFAULT 0;

-- (2) sign-in methods besides email: one TikTok account <-> one Wikigai account
CREATE TABLE IF NOT EXISTS user_identities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL CHECK (provider IN ('tiktok')),
    provider_uid  TEXT NOT NULL,                 -- TikTok open_id for the Wikigai client key
    display_name  TEXT,
    avatar_url    TEXT,
    linked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    UNIQUE (provider, provider_uid),
    UNIQUE (user_id, provider)
);

-- (3) short-lived TikTok access token for posting (no refresh token is ever stored). Deleted after 24 h.
CREATE TABLE IF NOT EXISTS tiktok_tokens (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    open_id       TEXT NOT NULL,
    token_enc     BYTEA NOT NULL,                -- pgp_sym_encrypt(access_token)
    scope         TEXT NOT NULL DEFAULT '',
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tiktok_tokens_exp ON tiktok_tokens (expires_at);

-- (4) carousel images TikTok pulls from /tt-media/<token>/<n>.jpg — deleted 24 h after creation
CREATE TABLE IF NOT EXISTS tiktok_media (
    token         TEXT NOT NULL,
    n             SMALLINT NOT NULL CHECK (n BETWEEN 1 AND 10),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data          BYTEA NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (token, n)
);
CREATE INDEX IF NOT EXISTS idx_tiktok_media_created ON tiktok_media (created_at);
CREATE INDEX IF NOT EXISTS idx_tiktok_media_user ON tiktok_media (user_id);

-- (5) OAuth "state" values: table oauth_states, created in 016_oauth_providers.sql (v20261112c)
