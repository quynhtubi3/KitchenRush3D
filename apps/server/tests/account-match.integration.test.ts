import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KitchenSession } from '../src/multiplayer/session';

const testUrl = process.env.ACCOUNT_TEST_DATABASE_URL;
if (testUrl && !/(^|_)test($|_)/i.test(new URL(testUrl).pathname.slice(1)))
  throw new Error('An isolated test database is required.');
let directory = '';
if (testUrl) {
  process.env.DATABASE_URL = testUrl;
  process.env.GUEST_ONLY = 'false';
  process.env.AUTH_ENABLED = 'true';
  process.env.REGISTRATION_ENABLED = 'true';
  process.env.CLOUD_SAVE_ENABLED = 'true';
  process.env.NODE_ENV = 'test';
  directory = await mkdtemp(join(tmpdir(), 'kr-room-db-'));
  process.env.MATCH_OUTBOX_DIR = directory;
}
const { CoopRoom } = await import('../src/rooms/CoopRoom');
const accounts = await import('../src/persistence/account-store');
const { pool } = await import('../src/persistence/database');
const persistence = await import('../src/persistence/match-persistence');
const http = createServer();
let server: Server, endpoint: string;
const rooms: Room[] = [],
  ids: string[] = [],
  matches: string[] = [];
const snapshot = (room: Room) => JSON.parse(room.state.snapshot);
const wait = (predicate: () => boolean) =>
  expect.poll(predicate, { timeout: 8000, interval: 50 }).toBe(true);
async function track(operation: Promise<Room>) {
  const room = await operation;
  room.reconnection.enabled = false;
  room.onMessage('notice', () => {});
  rooms.push(room);
  await wait(() => !!room.state?.snapshot);
  return room;
}
const authenticated = (token: string) =>
  new Client(endpoint, { headers: { Cookie: `kr_session=${token}` } });

(testUrl ? describe : describe.skip)('PostgreSQL-backed live room finalization', () => {
  beforeAll(async () => {
    await persistence.startMatchPersistence();
    server = new Server({
      greet: false,
      gracefullyShutdown: false,
      transport: new WebSocketTransport({ server: http }),
    });
    server.define('coop_private', CoopRoom);
    await server.listen(0, '127.0.0.1');
    endpoint = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    for (const room of rooms) if (room.connection.isOpen) await room.leave();
    await server?.gracefullyShutdown(false);
    await persistence.stopMatchPersistence();
    if (pool) {
      await pool.query('DELETE FROM match_result WHERE id=ANY($1::text[])', [matches]);
      await pool.query(
        'DELETE FROM player_profile WHERE id=ANY($1::uuid[]) AND merged_into IS NOT NULL',
        [ids],
      );
      await pool.query('DELETE FROM player_profile WHERE id=ANY($1::uuid[])', [ids]);
      await pool.end();
    }
    for (const name of await readdir(directory)) await unlink(join(directory, name));
    await rmdir(directory);
  });
  it('merges mid-match, reconnects and finalizes only the original playing cohort after room disposal', async () => {
    const guestToken = `guest-${randomUUID()}-${randomUUID()}`;
    const owner = await accounts.register(
      `test+${randomUUID()}@example.test`,
      'safe test password 12',
      'Test Owner',
    );
    const guest = await accounts.ensureGuest(guestToken);
    const mate = await accounts.ensureGuest(`guest-${randomUUID()}-${randomUUID()}`);
    const visitor = await accounts.ensureGuest(`guest-${randomUUID()}-${randomUUID()}`);
    ids.push(owner.account.id, guest.account.id, mate.account.id, visitor.account.id);
    const anonymous = await track(new Client(endpoint).create('coop_private', { teamSize: 2 }));
    expect(snapshot(anonymous).session.members).toHaveLength(1);
    await anonymous.leave();
    const host = await track(authenticated(guest.token).create('coop_private', { teamSize: 2 }));
    const departed = await track(authenticated(visitor.token).joinById(host.roomId));
    await departed.leave();
    await wait(() => snapshot(host).session.members.length === 1);
    const teammate = await track(authenticated(mate.token).joinById(host.roomId));
    host.send('intent', { type: 'ready', ready: true });
    teammate.send('intent', { type: 'ready', ready: true });
    await wait(() => snapshot(host).session.members.every((m: { ready: boolean }) => m.ready));
    host.send('intent', { type: 'start' });
    await wait(() => snapshot(host).phase === 'playing' && !snapshot(host).countdown);
    const device = await accounts.login(owner.account.email!, 'safe test password 12', guestToken);
    const reconnectionToken = host.reconnectionToken;
    host.connection.close();
    await wait(() => !snapshot(teammate).chefs[host.sessionId].connected);
    const restored = await track(new Client(endpoint).reconnect(reconnectionToken));
    expect(restored.sessionId).toBe(host.sessionId);
    await teammate.leave();
    const local = matchMaker.getLocalRoomById(host.roomId) as unknown as {
      session: KitchenSession;
    };
    // Accelerate the authoritative simulation; this tests persistence, not cooking skill.
    local.session.game.state.score = local.session.info.targetScore;
    local.session.game.state.served = local.session.info.targetOrders;
    local.session.game.state.remaining = 0.01;
    await wait(() => snapshot(restored).phase === 'finished');
    const result = snapshot(restored).result;
    matches.push(result.matchId);
    await restored.leave();
    await wait(() => !matchMaker.getLocalRoomById(host.roomId));
    await expect
      .poll(
        async () =>
          (await accounts.loadProgress(owner.account.id, result.matchId)).persistedMatchId,
      )
      .toBe(result.matchId);
    expect((await accounts.loadProgress(mate.account.id)).levels[0].wins).toBe(1);
    expect((await accounts.loadProgress(visitor.account.id)).levels).toEqual([]);
    expect((await accounts.loadProgress(guest.account.id)).levels).toEqual([]);
    const onDevice = await accounts.authenticate(device.token);
    expect(await accounts.loadProgress(onDevice!.id)).toEqual(
      await accounts.loadProgress(owner.account.id),
    );
    await accounts.persistMatch(result, [guest.account.id, mate.account.id]);
    expect((await accounts.loadProgress(owner.account.id)).levels[0].wins).toBe(1);
  });
});
