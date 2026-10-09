-- Phase 4.1: accounts, guest identities, server sessions and verified progress.
-- The stable campaign content keys remain the foreign keys for player progress.
ALTER TABLE player_profile
  ADD COLUMN username text,
  ADD COLUMN password_hash text,
  ADD COLUMN guest_token_hash text,
  ADD COLUMN player_code text,
  ADD COLUMN is_guest boolean NOT NULL DEFAULT true;

-- Preserve rows created by the original foundation migration. Their old IDs are
-- not credentials, so they receive non-recoverable guest tokens and cannot log in.
UPDATE player_profile
SET player_code = 'KR-' || upper(substr(md5(id::text), 1, 10)),
    guest_token_hash = md5('unrecoverable-' || id::text),
    is_guest = true
WHERE player_code IS NULL;

ALTER TABLE player_profile
  ALTER COLUMN player_code SET NOT NULL,
  ADD CONSTRAINT player_profile_auth_shape CHECK (
    (is_guest AND username IS NULL AND password_hash IS NULL AND guest_token_hash IS NOT NULL)
    OR
    (NOT is_guest AND username IS NOT NULL AND password_hash IS NOT NULL AND guest_token_hash IS NULL)
  );

CREATE UNIQUE INDEX player_profile_username_ci_uq
  ON player_profile (lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX player_profile_guest_token_uq
  ON player_profile (guest_token_hash) WHERE guest_token_hash IS NOT NULL;
CREATE UNIQUE INDEX player_profile_player_code_uq
  ON player_profile (player_code);

CREATE TABLE player_session (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  player_id uuid NOT NULL REFERENCES player_profile(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX player_session_player_idx ON player_session(player_id);
CREATE INDEX player_session_expiry_idx ON player_session(expires_at);

CREATE TABLE player_level_progress (
  player_id uuid NOT NULL REFERENCES player_profile(id) ON DELETE CASCADE,
  level_id text NOT NULL REFERENCES content(id) ON DELETE RESTRICT,
  completed boolean NOT NULL DEFAULT false,
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  best_score integer NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  best_stars smallint NOT NULL DEFAULT 0 CHECK (best_stars BETWEEN 0 AND 3),
  best_served integer NOT NULL DEFAULT 0 CHECK (best_served >= 0),
  best_missed integer NOT NULL DEFAULT 0 CHECK (best_missed >= 0),
  best_combo integer NOT NULL DEFAULT 0 CHECK (best_combo >= 0),
  best_average_service real NOT NULL DEFAULT 0 CHECK (best_average_service >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, level_id)
);
CREATE INDEX player_level_progress_level_idx ON player_level_progress(level_id, best_score DESC);

-- A match is stored once, while each account/guest that participated gets one
-- unique link. Replays are distinct match IDs; reconnect/retry writes are idempotent.
CREATE TABLE match_participant (
  match_id text NOT NULL REFERENCES match_result(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player_profile(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, player_id)
);
CREATE INDEX match_participant_player_idx ON match_participant(player_id, created_at DESC);

CREATE TABLE legacy_progress_import (
  player_id uuid NOT NULL REFERENCES player_profile(id) ON DELETE CASCADE,
  source_id text NOT NULL CHECK (length(source_id) = 64),
  payload jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY(player_id,source_id)
);
