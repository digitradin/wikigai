-- v20261112d: My learning › Schools — the user's saved programmes (shortlist). Idempotent (runs at every start).
-- program_id points at the programme id of the schools dataset (demo dataset now; the "schools" data
-- schema of Business_Model/Schools_Listings/wikigai_schools_schema.sql later). Personal data → in
-- lib/accountData.js (download, delete, merge).
CREATE TABLE IF NOT EXISTS favorite_schools (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, program_id)
);
CREATE INDEX IF NOT EXISTS idx_favorite_schools_user ON favorite_schools (user_id, created_at DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'favorite_schools_id_chk') THEN
    ALTER TABLE favorite_schools ADD CONSTRAINT favorite_schools_id_chk CHECK (program_id ~ '^[a-z0-9-]{3,80}$') NOT VALID; END IF;
END $$;
