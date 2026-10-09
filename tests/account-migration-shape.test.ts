import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { levels, recipes } from '../packages/content/src/campaign';

const migration = readFileSync('database/migrations/002_accounts_progress.sql', 'utf8');
const accountRoutes = readFileSync('apps/server/src/persistence/account-routes.ts', 'utf8');
const soloRoom = readFileSync('apps/server/src/rooms/KitchenRoom.ts', 'utf8');
const coopRoom = readFileSync('apps/server/src/rooms/CoopRoom.ts', 'utf8');

describe('phase 4.1 migration guards', () => {
  it('keeps the established campaign and recipe IDs unchanged', () => {
    expect(levels).toHaveLength(50);
    expect(recipes).toHaveLength(10);
    expect(levels.map((entry) => entry.id)).toContain('little-sun-01');
    expect(recipes.map((entry) => entry.id)).toContain('sunshine-burger');
    expect(migration).toContain('REFERENCES content(id) ON DELETE RESTRICT');
  });

  it('has database constraints for identity shape, session expiry and unique progress/results', () => {
    expect(migration).toContain('player_profile_auth_shape');
    expect(migration).toContain('player_profile_username_ci_uq');
    expect(migration).toContain('CREATE TABLE player_session');
    expect(migration).toContain('CHECK (expires_at > created_at)');
    expect(migration).toContain('PRIMARY KEY (player_id, level_id)');
    expect(migration).toContain('PRIMARY KEY (match_id, player_id)');
  });

  it('archives legacy local progress separately from authoritative unlock records', () => {
    expect(migration).toContain('CREATE TABLE legacy_progress_import');
    expect(migration).toContain('PRIMARY KEY(player_id,source_id)');
    expect(migration).not.toMatch(/INSERT INTO player_level_progress.*legacy_progress/is);
  });

  it('exposes no client result-write endpoint and persists only simulation room results', () => {
    expect(accountRoutes).not.toMatch(/\.post\(['"]\/(?:result|progress|match)['"]/i);
    expect(soloRoom).toContain('this.game.state.result');
    expect(coopRoom).toContain('this.session.game.state.result');
    expect(soloRoom).toContain('persistMatch(result');
    expect(coopRoom).toContain('persistMatch(result');
  });
});
