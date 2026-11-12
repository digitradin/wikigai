-- v20261028b: allow 'email_change' as a PIN purpose (Account page → change email; code sent to the NEW address).
-- v20261112b: every re-run must allow ALL purposes used today (all migrations run again at each start, in order):
-- a narrower list here failed on existing 'email_change' / 'delete' codes and stopped every later migration.
ALTER TABLE auth_pins DROP CONSTRAINT IF EXISTS auth_pins_purpose_check;
ALTER TABLE auth_pins ADD CONSTRAINT auth_pins_purpose_check
  CHECK (purpose IN ('signup','login','reset','email_change','delete'));
