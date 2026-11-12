-- v20261112c: sign-in providers beyond TikTok (Google, Facebook, Instagram — hidden until switched on). Idempotent.
-- (1) identities may come from any registered provider (backend/src/lib/oauth/index.js)
ALTER TABLE user_identities DROP CONSTRAINT IF EXISTS user_identities_provider_check;
ALTER TABLE user_identities ADD CONSTRAINT user_identities_provider_check
  CHECK (provider IN ('tiktok','google','facebook','instagram'));
-- (2) one OAuth "state" table for every provider (was tiktok_oauth_states in v20261112b)
DO $$ BEGIN
  IF to_regclass('public.tiktok_oauth_states') IS NOT NULL AND to_regclass('public.oauth_states') IS NULL THEN
    ALTER TABLE tiktok_oauth_states RENAME TO oauth_states;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS oauth_states (
    nonce         TEXT PRIMARY KEY,
    intent        TEXT NOT NULL,
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    lang          TEXT NOT NULL DEFAULT 'en',
    next          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TABLE IF EXISTS tiktok_oauth_states; -- leftover from v20261112b once renamed (states live 10 min, nothing to keep)
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'tiktok';
ALTER TABLE oauth_states DROP CONSTRAINT IF EXISTS tiktok_oauth_states_intent_check;
ALTER TABLE oauth_states DROP CONSTRAINT IF EXISTS oauth_states_intent_check;
ALTER TABLE oauth_states ADD CONSTRAINT oauth_states_intent_check CHECK (intent IN ('login','link','delete','share'));
