-- Preserve IDs referenced by live rooms and pending match finalization.
-- Existing identities are unchanged until an authenticated merge occurs.
ALTER TABLE player_profile
  ADD COLUMN merged_into uuid REFERENCES player_profile(id) ON DELETE RESTRICT,
  ADD CONSTRAINT player_profile_merge_shape CHECK (
    merged_into IS NULL OR (is_guest AND merged_into <> id)
  );
CREATE INDEX player_profile_merged_into_idx ON player_profile(merged_into)
  WHERE merged_into IS NOT NULL;
