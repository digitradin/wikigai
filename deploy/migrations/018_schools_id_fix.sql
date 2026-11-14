-- v20261114: fix — saving a programme failed (500) for areas whose id has an underscore (science_tech, built_env, law_gov):
-- programme ids look like "uk-science_tech-sw" but favorite_schools_id_chk (017) allowed only [a-z0-9-].
-- Replace the check with one that also allows "_". Idempotent (runs at every start), no data change.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorite_schools_id_chk'
             AND pg_get_constraintdef(oid) NOT LIKE '%a-z0-9_-%') THEN
    ALTER TABLE favorite_schools DROP CONSTRAINT favorite_schools_id_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorite_schools_id_chk') THEN
    ALTER TABLE favorite_schools ADD CONSTRAINT favorite_schools_id_chk CHECK (program_id ~ '^[a-z0-9_-]{3,80}$') NOT VALID;
  END IF;
END $$;
