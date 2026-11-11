-- v20261101c: plans are kept in "My favourites" only when the user saves them (step 4 → ⭐ Save).
-- Plans created before this version were all listed as saved, so they stay saved (default TRUE);
-- new plans are inserted with saved = FALSE until the user taps Save. Idempotent.
ALTER TABLE learning_plans ADD COLUMN IF NOT EXISTS saved BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_learning_plans_saved ON learning_plans (user_id, saved, created_at DESC);
