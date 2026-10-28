-- v20261028b: (1) survey results belong to the permanent account id (users.id), not to the email,
-- so an email change one day keeps every result. Backfill existing rows from the email hash. Idempotent.
UPDATE user_results r SET user_id = u.id
  FROM users u
 WHERE r.user_id IS NULL AND r.user_email = u.email_hash;
CREATE INDEX IF NOT EXISTS idx_user_results_user_id ON user_results(user_id);
-- (2) optional phone number (Account page), encrypted like the email
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_enc BYTEA;
