-- CPS — password authentication + account recovery
-- Applied idempotently at startup by lib/migrate.js.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at  TIMESTAMPTZ;

-- Password reset via emailed 6-digit code (both stored as a one-time PIN
-- in auth_pins with purpose='reset'); a counters table helps throttling.
CREATE INDEX IF NOT EXISTS idx_auth_pins_purpose ON auth_pins(purpose, email_hash);

-- Track failed password logins per user for lockout/throttle.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until         TIMESTAMPTZ;
