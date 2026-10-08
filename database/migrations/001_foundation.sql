CREATE TABLE content (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('level', 'recipe')),
  version integer NOT NULL CHECK (version > 0),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Persistence foundation for phase 4. Phase 1 deliberately does not write accounts/rewards.
CREATE TABLE player_profile (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 32),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE match_result (
  id text PRIMARY KEY,
  level_id text NOT NULL REFERENCES content(id),
  team_size smallint NOT NULL CHECK (team_size BETWEEN 1 AND 4),
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE currency_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES player_profile(id),
  idempotency_key text NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, idempotency_key)
);
