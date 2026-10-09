import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Result } from '../packages/shared/src/types';

const testUrl = process.env.ACCOUNT_TEST_DATABASE_URL;
const databaseName = testUrl ? new URL(testUrl).pathname.replace(/^\//, '') : '';
if (testUrl && !/(^|_)test($|_)/i.test(databaseName))
  throw new Error('ACCOUNT_TEST_DATABASE_URL must point to a database with "test" in its name.');
if (testUrl) {
  process.env.DATABASE_URL = testUrl;
  process.env.GUEST_ONLY = 'false';
}

const databaseModules = await import('../apps/server/src/persistence/database');
const accounts = await import('../apps/server/src/persistence/account-store');
const dbDescribe = testUrl ? describe : describe.skip;
const ids: string[] = [];
const matchIds: string[] = [];

dbDescribe('PostgreSQL account and progress integration', () => {
  beforeAll(async () => {
    if (!databaseModules.pool) throw new Error('Test database pool was not initialized.');
    const migration = await databaseModules.pool.query(
      "SELECT 1 FROM schema_migration WHERE name='002_accounts_progress.sql'",
    );
    expect(migration.rowCount).toBe(1);
    const content = await databaseModules.pool.query(
      "SELECT count(*)::int AS count FROM content WHERE kind='level' AND id LIKE '%-01'",
    );
    expect(Number(content.rows[0].count)).toBe(5);
  });

  afterAll(async () => {
    if (!databaseModules.pool) return;
    for (const id of matchIds)
      await databaseModules.pool.query('DELETE FROM match_result WHERE id=$1', [id]);
    for (const id of ids)
      await databaseModules.pool.query('DELETE FROM player_profile WHERE id=$1', [id]);
    await databaseModules.pool.end();
  });

  it('registers by upgrading a guest, logs in, revokes sessions and retains only hashed credentials', async () => {
    const guestToken = `guest-${randomUUID()}-${randomUUID()}`;
    const guest = await accounts.ensureGuest(guestToken, {
      wins: ['little-sun-01', 'invalid-level'],
      stars: { 'little-sun-01': 3, fake: 3 },
    });
    ids.push(guest.account.id);
    expect(guest.account.isGuest).toBe(true);
    expect(await accounts.canPlayLevel(guest.account.id, 'little-sun-01')).toBe(true);
    expect(await accounts.canPlayLevel(guest.account.id, 'little-sun-02')).toBe(false);
    const beforeRegistration = await accounts.loadProgress(guest.account.id);
    expect(beforeRegistration.legacyProgressIsUnverified).toBe(true);
    expect(beforeRegistration.legacyProgress).toMatchObject({
      wins: ['little-sun-01'],
      stars: { 'little-sun-01': 3 },
    });
    expect(beforeRegistration.unlocked).toEqual(['little-sun-01']);

    const created = await accounts.register(
      `test_${randomUUID().slice(0, 8)}`,
      'safe test password 12',
      guestToken,
    );
    expect(created.account.id).toBe(guest.account.id);
    expect(created.account.isGuest).toBe(false);
    expect(await accounts.authenticate(guest.token)).toBeNull();
    const principal = await accounts.authenticate(created.token);
    expect(principal?.id).toBe(guest.account.id);
    const stored = await databaseModules.pool!.query(
      'SELECT password_hash,guest_token_hash FROM player_profile WHERE id=$1',
      [guest.account.id],
    );
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(stored.rows[0].guest_token_hash).toBeNull();

    await expect(accounts.login(created.account.username!, 'incorrect password')).rejects.toThrow(
      'invalidCredentials',
    );
    const signedIn = await accounts.login(created.account.username!, 'safe test password 12');
    expect((await accounts.authenticate(signedIn.token))?.id).toBe(guest.account.id);
    await accounts.revokeSession(created.digest);
    expect(await accounts.authenticate(created.token)).toBeNull();
  });

  it('merges a guest once, preserves both imports and synchronizes two device sessions', async () => {
    const owner = await accounts.register(
      `test_${randomUUID().slice(0, 8)}`,
      'safe test password 12',
    );
    const guestToken = `guest-${randomUUID()}-${randomUUID()}`;
    const guest = await accounts.ensureGuest(guestToken, { wins: ['little-sun-01'] });
    ids.push(owner.account.id, guest.account.id);
    await accounts.archiveLegacyProgress(
      owner.account.id,
      { wins: ['little-sun-02'] },
      `device-${randomUUID()}`,
    );
    const result: Result = {
      matchId: randomUUID(),
      levelId: 'little-sun-01',
      teamSize: 2,
      won: true,
      stars: 2,
      score: 420,
      served: 3,
      missed: 0,
      bestCombo: 3,
      averageService: 22,
      duration: 90,
    };
    matchIds.push(result.matchId);
    await accounts.persistMatch(result, [owner.account.id, guest.account.id]);
    await expect(accounts.login(owner.account.username!, 'incorrect', guestToken)).rejects.toThrow(
      'invalidCredentials',
    );
    expect((await accounts.loadProgress(guest.account.id)).levels[0].wins).toBe(1);
    const device = await accounts.login(
      owner.account.username!,
      'safe test password 12',
      guestToken,
    );
    await accounts.login(owner.account.username!, 'safe test password 12', guestToken);
    const first = await accounts.authenticate(owner.token);
    const second = await accounts.authenticate(device.token);
    expect(first?.id).toBe(second?.id);
    const progress = await accounts.loadProgress(first!.id);
    expect(progress).toEqual(await accounts.loadProgress(second!.id));
    expect(progress.levels[0].wins).toBe(1);
    expect(progress.unlocked).toEqual(['little-sun-01', 'little-sun-02']);
    expect(progress.legacyProgress.imports).toHaveLength(2);
    expect(await accounts.authenticate(guest.token)).toBeNull();
    await databaseModules.pool!.query(
      "UPDATE player_session SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE token_hash=$1",
      [device.digest],
    );
    expect(await accounts.authenticate(device.token)).toBeNull();
    expect(await accounts.authenticate(owner.token)).not.toBeNull();
  });

  it('records an authoritative match exactly once per participant and derives sequential unlocks', async () => {
    const first = await accounts.ensureGuest(`guest-${randomUUID()}-${randomUUID()}`);
    const second = await accounts.ensureGuest(`guest-${randomUUID()}-${randomUUID()}`);
    ids.push(first.account.id, second.account.id);
    const matchId = randomUUID();
    matchIds.push(matchId);
    const result: Result = {
      matchId,
      levelId: 'little-sun-01',
      teamSize: 2,
      won: true,
      stars: 2,
      score: 420,
      served: 3,
      missed: 0,
      bestCombo: 3,
      averageService: 22,
      duration: 90,
    };
    await accounts.persistMatch(result, [first.account.id, second.account.id]);
    await accounts.persistMatch(result, [first.account.id, second.account.id]);
    const progress = await accounts.loadProgress(first.account.id);
    expect(progress.wins).toEqual(['little-sun-01']);
    expect(progress.unlocked.slice(0, 2)).toEqual(['little-sun-01', 'little-sun-02']);
    const participation = await databaseModules.pool!.query(
      'SELECT count(*)::int AS count FROM match_participant WHERE match_id=$1',
      [matchId],
    );
    expect(participation.rows[0].count).toBe(2);
    expect((await accounts.loadProgress(first.account.id, matchId)).persistedMatchId).toBe(matchId);
    expect(
      (await accounts.loadProgress(first.account.id, randomUUID())).persistedMatchId,
    ).toBeNull();
  });
});

if (!testUrl) {
  describe('PostgreSQL integration setup', () => {
    it.skip('set ACCOUNT_TEST_DATABASE_URL to an isolated migrated PostgreSQL test database', () => {});
  });
}
