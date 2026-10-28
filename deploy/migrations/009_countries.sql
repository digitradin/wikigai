-- Account page (v20261028b): country of residence + countries the user wants to study / work in. Idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS residence_country TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS target_countries TEXT[] NOT NULL DEFAULT '{}';
