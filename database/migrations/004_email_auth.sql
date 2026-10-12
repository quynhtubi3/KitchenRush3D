-- Email is the login identifier for new accounts. Keep legacy usernames so
-- existing accounts created by 4.1 remain able to sign in during migration.
ALTER TABLE player_profile ADD COLUMN email text;
ALTER TABLE player_profile DROP CONSTRAINT player_profile_auth_shape;
ALTER TABLE player_profile ADD CONSTRAINT player_profile_auth_shape CHECK (
  (is_guest AND username IS NULL AND email IS NULL AND password_hash IS NULL AND guest_token_hash IS NOT NULL)
  OR
  (NOT is_guest AND password_hash IS NOT NULL AND guest_token_hash IS NULL AND (username IS NOT NULL OR email IS NOT NULL))
);
ALTER TABLE player_profile ADD CONSTRAINT player_profile_email_shape CHECK (
  email IS NULL OR (length(email) BETWEEN 3 AND 254 AND email = lower(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);
CREATE UNIQUE INDEX player_profile_email_ci_uq
  ON player_profile (lower(email)) WHERE email IS NOT NULL;
