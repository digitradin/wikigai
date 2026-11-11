-- v20261101e: structure + hygiene for My favourites, Plans and WikiVids. Idempotent (runs at every start).
-- Constraints are added NOT VALID: they protect every NEW / UPDATED row without failing on old data.

-- 1) Plans: when was it saved to My favourites (sort order + stats). Old saved plans: saved_at = created_at.
ALTER TABLE learning_plans ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ;
UPDATE learning_plans SET saved_at = created_at WHERE saved AND saved_at IS NULL;
UPDATE learning_plans SET saved_at = NULL WHERE NOT saved AND saved_at IS NOT NULL;

-- 2) Data rules (shape checks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_plans_lang_chk') THEN
    ALTER TABLE learning_plans ADD CONSTRAINT learning_plans_lang_chk CHECK (lang IN ('en','fr','es')) NOT VALID; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_plans_skills_chk') THEN
    ALTER TABLE learning_plans ADD CONSTRAINT learning_plans_skills_chk
      CHECK (jsonb_typeof(skills) = 'array' AND jsonb_array_length(skills) BETWEEN 1 AND 10) NOT VALID; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_plans_json_chk') THEN
    ALTER TABLE learning_plans ADD CONSTRAINT learning_plans_json_chk
      CHECK (jsonb_typeof(outlook) = 'object' AND jsonb_typeof(plan) = 'object') NOT VALID; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_plans_saved_at_chk') THEN
    ALTER TABLE learning_plans ADD CONSTRAINT learning_plans_saved_at_chk
      CHECK ((saved AND saved_at IS NOT NULL) OR (NOT saved AND saved_at IS NULL)) NOT VALID; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learning_plans_profession_chk') THEN
    ALTER TABLE learning_plans ADD CONSTRAINT learning_plans_profession_chk CHECK (char_length(profession) BETWEEN 2 AND 120) NOT VALID; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorite_videos_id_chk') THEN
    ALTER TABLE favorite_videos ADD CONSTRAINT favorite_videos_id_chk CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$') NOT VALID; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorite_videos_nums_chk') THEN
    ALTER TABLE favorite_videos ADD CONSTRAINT favorite_videos_nums_chk
      CHECK ((duration_s IS NULL OR duration_s >= 0) AND (views IS NULL OR views >= 0)) NOT VALID; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_outlook_cache_lang_chk') THEN
    ALTER TABLE plan_outlook_cache ADD CONSTRAINT plan_outlook_cache_lang_chk CHECK (lang IN ('en','fr','es')) NOT VALID; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_ai_log_kind_chk') THEN
    ALTER TABLE plan_ai_log ADD CONSTRAINT plan_ai_log_kind_chk CHECK (kind IN ('outlook','plan')) NOT VALID; END IF;
END $$;

-- 3) Indexes matched to the real queries
DROP INDEX IF EXISTS idx_learning_plans_saved;                                   -- replaced by the partial index below
CREATE INDEX IF NOT EXISTS idx_learning_plans_fav ON learning_plans (user_id, saved_at DESC) WHERE saved;  -- My favourites › My plans
CREATE INDEX IF NOT EXISTS idx_learning_plans_unsaved ON learning_plans (created_at) WHERE NOT saved;      -- clean-up of unsaved plans
CREATE INDEX IF NOT EXISTS idx_video_search_cache_created ON video_search_cache (created_at);
CREATE INDEX IF NOT EXISTS idx_plan_outlook_cache_created ON plan_outlook_cache (created_at);
CREATE INDEX IF NOT EXISTS idx_video_search_log_created ON video_search_log (created_at);
CREATE INDEX IF NOT EXISTS idx_plan_ai_log_created ON plan_ai_log (created_at);

-- 4) One read-only view of everything a user keeps in My favourites (stats, exports, future types).
--    Each kind keeps its own table (its own columns and rules); new kinds (courses, schools…) add a UNION branch.
CREATE OR REPLACE VIEW user_favorites AS
  SELECT user_id, 'plan'::text AS kind, id::text AS ref, profession AS title, saved_at AS saved_at
    FROM learning_plans WHERE saved
  UNION ALL
  SELECT user_id, 'video'::text AS kind, video_id AS ref, title, created_at AS saved_at
    FROM favorite_videos;

COMMENT ON TABLE learning_plans IS 'Study plans (Plans step 4). saved=true → in My favourites (saved_at set). Unsaved plans are purged after PLAN_UNSAVED_DAYS (default 30).';
COMMENT ON TABLE favorite_videos IS 'WikiVids saved by a user (My favourites › My WikiVids). Max 200 per user (enforced by the API).';
COMMENT ON TABLE plan_outlook_cache IS 'Shared AI profession overviews (Plans step 2), reused 30 days, purged after that.';
COMMENT ON TABLE video_search_cache IS 'Shared filtered YouTube results, reused VIDEO_CACHE_HOURS, purged after that.';
COMMENT ON TABLE plan_ai_log IS 'Fresh AI calls per user, for the daily limit only. Purged after 7 days.';
COMMENT ON TABLE video_search_log IS 'Fresh video searches per user, for the daily limit only. Purged after 7 days.';
COMMENT ON VIEW user_favorites IS 'Everything a user saved in My favourites (plans + WikiVids), one row per item.';
