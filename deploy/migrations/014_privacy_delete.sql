-- v20261111b: allow 'delete' as a PIN purpose (public /delete-my-data page: a 6-digit code emailed to the
-- account address proves ownership, so people who forgot their password can still erase all their data). Idempotent.
ALTER TABLE auth_pins DROP CONSTRAINT IF EXISTS auth_pins_purpose_check;
ALTER TABLE auth_pins ADD CONSTRAINT auth_pins_purpose_check
  CHECK (purpose IN ('signup','login','reset','email_change','delete'));
