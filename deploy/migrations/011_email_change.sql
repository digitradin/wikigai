-- v20261028b: allow 'email_change' as a PIN purpose (Account page → change email; code sent to the NEW address).
ALTER TABLE auth_pins DROP CONSTRAINT IF EXISTS auth_pins_purpose_check;
ALTER TABLE auth_pins ADD CONSTRAINT auth_pins_purpose_check
  CHECK (purpose IN ('signup','login','reset','email_change'));
