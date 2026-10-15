-- Allow 'reset' as a PIN purpose (password reset flow).
ALTER TABLE auth_pins DROP CONSTRAINT IF EXISTS auth_pins_purpose_check;
ALTER TABLE auth_pins ADD CONSTRAINT auth_pins_purpose_check
  CHECK (purpose IN ('signup','login','reset'));
