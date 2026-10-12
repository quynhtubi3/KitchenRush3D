ALTER TABLE player_profile
  ADD COLUMN last_played_at timestamptz,
  ADD COLUMN default_chef_appearance jsonb NOT NULL DEFAULT '{"variant":"classic"}'::jsonb;

ALTER TABLE player_level_progress ADD COLUMN restaurant_id text;
UPDATE player_level_progress p
SET restaurant_id = COALESCE(c.data->>'restaurantId', regexp_replace(p.level_id, '-[0-9]+$', ''))
FROM content c
WHERE c.id = p.level_id;
UPDATE player_level_progress
SET restaurant_id = regexp_replace(level_id, '-[0-9]+$', '')
WHERE restaurant_id IS NULL;
ALTER TABLE player_level_progress ALTER COLUMN restaurant_id SET NOT NULL;
CREATE INDEX player_level_progress_restaurant_idx
  ON player_level_progress(player_id, restaurant_id, level_id);
