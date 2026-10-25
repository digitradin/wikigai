-- Optional birthday (sign-up + Account page): lets AI learning plans match the user's age. Idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
