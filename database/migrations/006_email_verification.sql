ALTER TABLE player_profile ADD COLUMN email_verified_at timestamptz;

-- Accounts that existed before verification was introduced remain usable. New
-- production email registrations leave this timestamp null until confirmation.
UPDATE player_profile
SET email_verified_at = created_at
WHERE NOT is_guest AND email IS NOT NULL;

ALTER TABLE player_profile ADD CONSTRAINT player_profile_email_verified_shape CHECK (
  NOT is_guest OR email_verified_at IS NULL
);

CREATE TABLE account_email_action (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  player_id uuid NOT NULL REFERENCES player_profile(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verifyEmail', 'resetPassword')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX account_email_action_player_idx
  ON account_email_action(player_id, purpose, created_at DESC);
CREATE INDEX account_email_action_expiry_idx
  ON account_email_action(expires_at) WHERE consumed_at IS NULL;
