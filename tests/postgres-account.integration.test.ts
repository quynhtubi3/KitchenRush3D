import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, connect, type Socket, type AddressInfo } from 'node:net';
import { mkdtemp, readdir, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatchQueue } from '../apps/server/src/persistence/match-queue';
import { hashPassword } from '../apps/server/src/persistence/credentials';
import type { Result } from '../packages/shared/src/types';

const testUrl = process.env.ACCOUNT_TEST_DATABASE_URL;
const databaseName = testUrl ? new URL(testUrl).pathname.replace(/^\//, '') : '';
if (testUrl && !/(^|_)test($|_)/i.test(databaseName))
  throw new Error('ACCOUNT_TEST_DATABASE_URL must point to a database with "test" in its name.');
let online = true;
const sockets = new Set<Socket>();
const proxy = createServer((incoming) => {
  if (!online || !testUrl) return incoming.destroy();
  const target = new URL(testUrl);
  const outgoing = connect(Number(target.port || 5432), target.hostname);
  sockets.add(incoming);
  sockets.add(outgoing);
  incoming.on('error', () => outgoing.destroy());
  outgoing.on('error', () => incoming.destroy());
  incoming.on('close', () => {
    sockets.delete(incoming);
    outgoing.destroy();
  });
  outgoing.on('close', () => {
    sockets.delete(outgoing);
    incoming.destroy();
  });
  incoming.pipe(outgoing).pipe(incoming);
});
if (testUrl) {
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const proxied = new URL(testUrl);
  proxied.hostname = '127.0.0.1';
  proxied.port = String((proxy.address() as AddressInfo).port);
  process.env.DATABASE_URL = proxied.href;
  process.env.GUEST_ONLY = 'false';
  process.env.AUTH_ENABLED = 'true';
  process.env.REGISTRATION_ENABLED = 'true';
  process.env.CLOUD_SAVE_ENABLED = 'true';
  process.env.NODE_ENV = 'test';
}

const databaseModules = await import('../apps/server/src/persistence/database');
const accounts = await import('../apps/server/src/persistence/account-store');
const dbDescribe = testUrl ? describe : describe.skip;
const ids: string[] = [];
const matchIds: string[] = [];
function newResult(): Result {
  const r: Result = {
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
  matchIds.push(r.matchId);
  return r;
}

dbDescribe('PostgreSQL account and progress integration', () => {
  beforeAll(async () => {
    if (!databaseModules.pool) throw new Error('Test database pool was not initialized.');
    const migration = await databaseModules.pool.query(
      "SELECT count(*)::int AS count FROM schema_migration WHERE name IN ('003_identity_merge.sql','004_email_auth.sql','005_profile_progress_scope.sql','006_email_verification.sql')",
    );
    expect(Number(migration.rows[0].count)).toBe(4);
    const content = await databaseModules.pool.query(
      "SELECT count(*)::int AS count FROM content WHERE kind='level' AND id LIKE '%-01'",
    );
    expect(Number(content.rows[0].count)).toBe(5);
  });

  afterAll(async () => {
    if (!databaseModules.pool) return;
    for (const id of matchIds)
      await databaseModules.pool.query('DELETE FROM match_result WHERE id=$1', [id]);
    // Delete only fixture identities, aliases first because their target FK is RESTRICT.
    await databaseModules.pool.query(
      'DELETE FROM player_profile WHERE id=ANY($1::uuid[]) AND merged_into IS NOT NULL',
      [ids],
    );
    await databaseModules.pool.query('DELETE FROM player_profile WHERE id=ANY($1::uuid[])', [ids]);
    await databaseModules.pool.end();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  });

  it('applies migration 003 to populated 4.1 tables without rewriting existing progress', async () => {
    const client = await databaseModules.pool!.connect();
    const schema = `a2_upgrade_${randomUUID().replaceAll('-', '')}`;
    const player = randomUUID();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET LOCAL search_path TO ${schema}`);
      for (const name of ['001_foundation.sql', '002_accounts_progress.sql'])
        await client.query(
          await readFile(new URL(`../database/migrations/${name}`, import.meta.url), 'utf8'),
        );
      await client.query(
        "INSERT INTO content(id,kind,version,data) VALUES('little-sun-01','level',1,'{\"restaurantId\":\"little-sun\"}')",
      );
      await client.query(
        "INSERT INTO player_profile(id,display_name,player_code,guest_token_hash) VALUES($1,'Existing Guest','KR-UPGRADE','old-guest-hash')",
        [player],
      );
      await client.query(
        "INSERT INTO player_level_progress(player_id,level_id,completed,wins,best_score,best_stars) VALUES($1,'little-sun-01',true,4,700,3)",
        [player],
      );
      const before = await client.query(
        'SELECT player_id,level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service,updated_at FROM player_level_progress WHERE player_id=$1',
        [player],
      );
      await client.query(
        await readFile(
          new URL('../database/migrations/003_identity_merge.sql', import.meta.url),
          'utf8',
        ),
      );
      await client.query(
        await readFile(
          new URL('../database/migrations/004_email_auth.sql', import.meta.url),
          'utf8',
        ),
      );
      await client.query(
        await readFile(
          new URL('../database/migrations/005_profile_progress_scope.sql', import.meta.url),
          'utf8',
        ),
      );
      await client.query(
        await readFile(
          new URL('../database/migrations/006_email_verification.sql', import.meta.url),
          'utf8',
        ),
      );
      expect(
        (
          await client.query(
            'SELECT player_id,level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service,updated_at FROM player_level_progress WHERE player_id=$1',
            [player],
          )
        ).rows,
      ).toEqual(before.rows);
      expect(
        (await client.query('SELECT merged_into FROM player_profile WHERE id=$1', [player])).rows[0]
          .merged_into,
      ).toBeNull();
      expect(
        (
          await client.query(
            'SELECT email,last_played_at,default_chef_appearance FROM player_profile WHERE id=$1',
            [player],
          )
        ).rows[0],
      ).toMatchObject({
        email: null,
        last_played_at: null,
        default_chef_appearance: { variant: 'classic' },
      });
      expect(
        (
          await client.query('SELECT restaurant_id FROM player_level_progress WHERE player_id=$1', [
            player,
          ])
        ).rows[0].restaurant_id,
      ).toBe('little-sun');
    } finally {
      // Schema and fixture rows are transaction-local; public test data is untouched.
      await client.query('ROLLBACK');
      client.release();
    }
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

    const email = `test+${randomUUID()}@example.test`;
    const created = await accounts.register(
      email,
      'safe test password 12',
      'Test Chef',
      guestToken,
      { wins: ['little-sun-02'], stars: { 'little-sun-02': 2 } },
    );
    expect(created.account.id).toBe(guest.account.id);
    expect(created.account.isGuest).toBe(false);
    await expect(
      accounts.register(email.toUpperCase(), 'safe test password 12', 'Duplicate'),
    ).rejects.toThrow('emailTaken');
    const migrated = await accounts.loadProgress(created.account.id);
    expect(migrated.legacyProgressIsUnverified).toBe(true);
    expect(migrated.unlocked).toEqual(['little-sun-01']);
    expect(await accounts.authenticate(guest.token)).toBeNull();
    const principal = await accounts.authenticate(created.token);
    expect(principal?.id).toBe(guest.account.id);
    const stored = await databaseModules.pool!.query(
      'SELECT password_hash,guest_token_hash FROM player_profile WHERE id=$1',
      [guest.account.id],
    );
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(stored.rows[0].guest_token_hash).toBeNull();

    await expect(accounts.login(email, 'incorrect password')).rejects.toThrow('invalidCredentials');
    const signedIn = await accounts.login(email, 'safe test password 12');
    expect((await accounts.authenticate(signedIn.token))?.id).toBe(guest.account.id);
    await accounts.revokeSession(created.digest);
    expect(await accounts.authenticate(created.token)).toBeNull();
    const reset = await accounts.login(email, 'safe test password 12');
    await accounts.changePassword(
      created.account.id,
      reset.digest,
      'safe test password 12',
      'better password 456',
    );
    expect(await accounts.authenticate(signedIn.token)).toBeNull();
    await expect(accounts.login(email, 'safe test password 12')).rejects.toThrow(
      'invalidCredentials',
    );
    expect((await accounts.login(email, 'better password 456')).account.id).toBe(
      created.account.id,
    );
  });

  it('verifies a pending email once, merges Guest progress only after confirmation, and resets password once', async () => {
    const guestToken = `guest-${randomUUID()}-${randomUUID()}`;
    const guest = await accounts.ensureGuest(guestToken);
    ids.push(guest.account.id);
    const email = `verify+${randomUUID()}@example.test`;
    const pending = await accounts.registerPendingEmail(
      email,
      'pending test password 88',
      'Pending Chef',
      guestToken,
      { wins: ['little-sun-01'] },
    );
    expect(pending.email).toBe(email);
    expect(pending.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const player = await databaseModules.pool!.query(
      'SELECT id,email_verified_at,is_guest FROM player_profile WHERE lower(email)=lower($1)',
      [email],
    );
    expect(player.rows[0]).toMatchObject({ email_verified_at: null, is_guest: false });
    ids.push(player.rows[0].id);
    expect(await accounts.authenticate(pending.token!)).toBeNull();
    await expect(accounts.login(email, 'pending test password 88')).rejects.toThrow(
      'invalidCredentials',
    );
    expect((await accounts.loadProgress(guest.account.id)).legacyProgress).toBeNull();
    expect(
      await accounts.registerPendingEmail(email, 'pending test password 88', 'Duplicate'),
    ).toEqual({
      email: null,
      token: null,
    });

    const verified = await accounts.verifyEmailAction(pending.token, guestToken);
    expect(verified.account).toMatchObject({ email, emailVerified: true, isGuest: false });
    expect((await accounts.authenticate(verified.token))?.id).toBe(player.rows[0].id);
    expect((await accounts.loadProgress(player.rows[0].id)).legacyProgress).toMatchObject({
      wins: ['little-sun-01'],
    });
    await expect(accounts.verifyEmailAction(pending.token)).rejects.toThrow('invalidActionToken');

    const reset = await accounts.requestEmailAction(email, 'resetPassword');
    expect(reset?.email).toBe(email);
    expect(await accounts.requestEmailAction(email, 'resetPassword')).toBeNull();
    await accounts.resetPasswordWithAction(reset!.token, 'reset test password 99');
    expect(await accounts.authenticate(verified.token)).toBeNull();
    await expect(
      accounts.resetPasswordWithAction(reset!.token, 'another password 00'),
    ).rejects.toThrow('invalidActionToken');
    expect((await accounts.login(email, 'reset test password 99')).account.id).toBe(
      player.rows[0].id,
    );
  });

  it('keeps existing username identities able to sign in during the email migration', async () => {
    const id = randomUUID();
    const username = `old_${randomUUID().slice(0, 8)}`;
    const passwordHash = await hashPassword('legacy test password 77');
    ids.push(id);
    await databaseModules.pool!.query(
      `INSERT INTO player_profile(id,display_name,player_code,username,password_hash,is_guest)
       VALUES($1,'Legacy Chef',$2,$3,$4,false)`,
      [id, `KR-${randomUUID().slice(0, 10)}`, username, passwordHash],
    );
    const signedIn = await accounts.login(username, 'legacy test password 77');
    expect(signedIn.account).toMatchObject({ id, username, email: null, isGuest: false });
    expect((await accounts.authenticate(signedIn.token))?.id).toBe(id);
  });

  it('merges a guest once, preserves both imports and synchronizes two device sessions', async () => {
    const owner = await accounts.register(
      `test+${randomUUID()}@example.test`,
      'safe test password 12',
      'Owner',
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
    await expect(accounts.login(owner.account.email!, 'incorrect', guestToken)).rejects.toThrow(
      'invalidCredentials',
    );
    expect((await accounts.loadProgress(guest.account.id)).levels[0].wins).toBe(1);
    const device = await accounts.login(owner.account.email!, 'safe test password 12', guestToken);
    await accounts.login(owner.account.email!, 'safe test password 12', guestToken);
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

  it('routes a result held by a live Guest room to the merged account without losing team progress', async () => {
    const owner = await accounts.register(
      `test+${randomUUID()}@example.test`,
      'safe test password 12',
      'Owner',
    );
    const token = `guest-${randomUUID()}-${randomUUID()}`;
    const guest = await accounts.ensureGuest(token);
    const teammate = await accounts.ensureGuest(`guest-${randomUUID()}-${randomUUID()}`);
    ids.push(owner.account.id, guest.account.id, teammate.account.id);
    const device = await accounts.login(owner.account.email!, 'safe test password 12', token);
    const tombstone = await databaseModules.pool!.query(
      'SELECT merged_into FROM player_profile WHERE id=$1',
      [guest.account.id],
    );
    expect(tombstone.rows[0].merged_into).toBe(owner.account.id);
    expect(await accounts.authenticate(guest.token)).toBeNull();
    await expect(accounts.ensureGuest(token)).rejects.toThrow('guestTokenUsed');
    await expect(
      accounts.register(
        `test+${randomUUID()}@example.test`,
        'safe test password 12',
        'Other',
        token,
      ),
    ).rejects.toThrow('guestTokenUsed');
    const result = newResult();
    await Promise.all(
      Array.from({ length: 5 }, () =>
        accounts.persistMatch(result, [guest.account.id, teammate.account.id, owner.account.id]),
      ),
    );
    expect((await accounts.loadProgress(owner.account.id)).levels[0].wins).toBe(1);
    expect((await accounts.loadProgress(teammate.account.id)).levels[0].wins).toBe(1);
    expect((await accounts.loadProgress(guest.account.id)).levels).toEqual([]);
    await accounts.archiveLegacyProgress(
      guest.account.id,
      { wins: ['little-sun-02'] },
      `device-${randomUUID()}`,
    );
    expect((await accounts.loadProgress(owner.account.id)).legacyProgress).toMatchObject({
      wins: ['little-sun-02'],
    });
    const p1 = await accounts.authenticate(owner.token),
      p2 = await accounts.authenticate(device.token);
    expect(await accounts.loadProgress(p1!.id, result.matchId)).toEqual(
      await accounts.loadProgress(p2!.id, result.matchId),
    );
    const links = await databaseModules.pool!.query(
      'SELECT player_id FROM match_participant WHERE match_id=$1',
      [result.matchId],
    );
    expect(links.rows.map((row) => row.player_id).sort()).toEqual(
      [owner.account.id, teammate.account.id].sort(),
    );
  });

  it('serializes concurrent merges and finalizations without lost or doubled wins', async () => {
    const owner = await accounts.register(
      `test+${randomUUID()}@example.test`,
      'safe test password 12',
      'Owner',
    );
    const token = `guest-${randomUUID()}-${randomUUID()}`;
    const guest = await accounts.ensureGuest(token);
    ids.push(owner.account.id, guest.account.id);
    const results = [newResult(), newResult(), newResult()];
    await Promise.all([
      accounts.persistMatch(results[0], [guest.account.id, owner.account.id]),
      accounts.login(owner.account.email!, 'safe test password 12', token),
      accounts.persistMatch(results[1], [guest.account.id]),
      accounts.login(owner.account.email!, 'safe test password 12', token),
      accounts.persistMatch(results[2], [owner.account.id]),
    ]);
    expect((await accounts.loadProgress(owner.account.id)).levels[0].wins).toBe(3);
    expect((await accounts.loadProgress(guest.account.id)).levels).toEqual([]);
  });

  it('replays a durable result after a real TCP outage and worker restart exactly once', async () => {
    const guest = await accounts.ensureGuest(`guest-${randomUUID()}-${randomUUID()}`);
    ids.push(guest.account.id);
    const result = newResult();
    const directory = await mkdtemp(join(tmpdir(), 'kr-db-outage-'));
    const failures: unknown[] = [];
    let worker = new MatchQueue(directory, accounts.persistMatch, {
      baseDelay: 50,
      maxDelay: 100,
      report: (_id, _attempt, error) => failures.push(error),
    });
    try {
      online = false;
      for (const socket of sockets) socket.destroy();
      await worker.start();
      worker.submit(result, [guest.account.id]);
      await expect.poll(() => failures.length, { timeout: 10000 }).toBeGreaterThan(0);
      await worker.stop();
      expect((await readdir(directory)).filter((name) => name.endsWith('.json'))).toHaveLength(1);
      online = true;
      let committed = false;
      worker = new MatchQueue(
        directory,
        async (r, participants) => {
          await accounts.persistMatch(r, participants);
          committed = true;
          throw new Error('lostAcknowledgementAfterCommit');
        },
        { baseDelay: 100 },
      );
      await worker.start();
      await expect.poll(() => committed, { timeout: 12000 }).toBe(true);
      await worker.stop();
      expect((await readdir(directory)).filter((name) => name.endsWith('.json'))).toHaveLength(1);
      worker = new MatchQueue(directory, accounts.persistMatch, { baseDelay: 50 });
      await worker.start();
      await expect.poll(() => worker.size, { timeout: 10000 }).toBe(0);
      await accounts.persistMatch(result, [guest.account.id]);
      expect((await accounts.loadProgress(guest.account.id)).levels[0].wins).toBe(1);
      expect(await readdir(directory)).toEqual([]);
    } finally {
      online = true;
      await worker.stop();
      for (const name of await readdir(directory)) await unlink(join(directory, name));
      await rmdir(directory);
    }
  });
});

if (!testUrl) {
  describe('PostgreSQL integration setup', () => {
    it.skip('set ACCOUNT_TEST_DATABASE_URL to an isolated migrated PostgreSQL test database', () => {});
  });
}
