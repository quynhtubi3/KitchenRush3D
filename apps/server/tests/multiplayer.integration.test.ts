import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import { CoopRoom } from '../src/rooms/CoopRoom';
import { KitchenRoom } from '../src/rooms/KitchenRoom';
import type { Snapshot } from '../../../packages/shared/src/types';

const http = createServer();
let server: Server, endpoint: string;
const rooms: Room[] = [];
const snapshot = (r: Room) => JSON.parse(r.state.snapshot) as Snapshot;
const wait = (predicate: () => boolean, timeout = 8000) =>
  expect.poll(predicate, { timeout, interval: 50 }).toBe(true);
async function track(p: Promise<Room>) {
  const r = await p;
  r.onMessage('notice', () => {});
  rooms.push(r);
  await wait(() => !!r.state?.snapshot);
  return r;
}
async function createPair(levelId = 'little-sun-01') {
  const a = await track(new Client(endpoint).create('coop_private', { teamSize: 4, levelId }));
  const b = await track(new Client(endpoint).joinById(a.roomId));
  await wait(() => snapshot(a).session!.members.length === 2);
  a.send('intent', { type: 'ready', ready: true });
  b.send('intent', { type: 'ready', ready: true });
  await wait(() => snapshot(a).session!.members.every((m) => m.ready));
  a.send('intent', { type: 'start' });
  await wait(() => snapshot(a).phase === 'playing' && snapshot(b).phase === 'playing');
  await wait(() => !snapshot(a).countdown && !snapshot(b).countdown);
  return [a, b] as const;
}
async function act(r: Room, station: string) {
  await wait(() => !snapshot(r).countdown);
  const seq = snapshot(r).event.seq;
  r.send('intent', { type: 'interact', station });
  await wait(() => snapshot(r).event.seq > seq && !snapshot(r).chefs[r.sessionId]?.target);
}
const hand = (r: Room) => snapshot(r).chefs[r.sessionId]?.item;
beforeAll(async () => {
  server = new Server({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport({ server: http, maxPayload: 4096 }),
  });
  server.define('coop_private', CoopRoom);
  server.define('solo', KitchenRoom);
  server.define('coop_public', CoopRoom).filterBy(['teamSize', 'levelId']);
  await server.listen(0, '127.0.0.1');
  endpoint = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await Promise.all(
    rooms.splice(0).map((r) => {
      r.reconnection.enabled = false;
      return r.connection.isOpen ? r.leave().catch(() => {}) : Promise.resolve();
    }),
  );
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});
describe('real Colyseus clients', () => {
  it('synchronizes a selected variant and preserves a carried partial plate through reconnect', async () => {
    const [a, b] = await createPair('little-sun-10');
    a.send('intent', { type: 'selectRecipe', recipe: 'sunshine-cheeseburger' });
    await wait(() => snapshot(b).chefs[a.sessionId]?.preferredRecipe === 'sunshine-cheeseburger');
    await act(a, 'rack');
    await act(a, 'assembly');
    await act(a, 'bun');
    await act(a, 'assembly');
    await wait(
      () =>
        snapshot(b).stations.find((station) => station.id === 'assembly')?.item?.assemblyRecipe ===
        'sunshine-cheeseburger',
    );
    await act(b, 'meat');
    const ingredientId = hand(b)!.id;
    b.send('intent', { type: 'interact', station: 'assembly' });
    const assembly = snapshot(b).stations.find((station) => station.id === 'assembly')!;
    await wait(
      () =>
        !snapshot(b).chefs[b.sessionId].target &&
        Math.hypot(
          snapshot(b).chefs[b.sessionId].x - assembly.x,
          snapshot(b).chefs[b.sessionId].z - assembly.z,
        ) <= 1.05,
    );
    expect(hand(b)?.id).toBe(ingredientId);
    await act(a, 'assembly');
    const plate = hand(a)!;
    expect(plate.assemblyRecipe).toBe('sunshine-cheeseburger');
    const firstOrder = snapshot(a).customers[0];
    const token = a.reconnectionToken;
    a.reconnection.enabled = false;
    a.connection.close();
    await wait(() => !snapshot(b).chefs[a.sessionId].connected);
    const restored = await track(new Client(endpoint).reconnect(token));
    await wait(() => snapshot(b).chefs[restored.sessionId].connected);
    expect(hand(restored)).toEqual(plate);
    expect(snapshot(b).chefs[restored.sessionId].item).toEqual(plate);
    expect(snapshot(restored).levelId).toBe('little-sun-10');
    expect(
      snapshot(restored).customers.find((customer) => customer.id === firstOrder.id)?.recipe,
    ).toBe(firstOrder.recipe);
  });
  it('preserves the full Solo shift during delayed seat consumption and countdown', async () => {
    const reservation = await matchMaker.create('solo', { levelId: 'little-sun-01' });
    const pending = matchMaker.getLocalRoomById(reservation.roomId) as KitchenRoom;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const before = JSON.parse(pending.state.snapshot) as Snapshot;
    expect(Object.keys(before.chefs)).toHaveLength(0);
    expect(before.elapsed).toBe(0);
    expect(before.remaining).toBe(180);
    const a = await track(new Client(endpoint).consumeSeatReservation(reservation));
    expect(snapshot(a).countdown).toBeGreaterThan(0);
    a.send('intent', { type: 'interact', station: 'bun' });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(snapshot(a).remaining).toBe(180);
    expect(hand(a)).toBeNull();
    await wait(() => !snapshot(a).countdown && snapshot(a).remaining < 180);
    await act(a, 'rack');
    const held = hand(a)!;
    const token = a.reconnectionToken;
    a.reconnection.enabled = false;
    a.connection.close();
    await wait(() => JSON.parse(pending.state.snapshot).phase === 'paused');
    const paused = JSON.parse(pending.state.snapshot).remaining;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(JSON.parse(pending.state.snapshot).remaining).toBe(paused);
    const restored = await track(new Client(endpoint).reconnect(token));
    expect(restored.sessionId).toBe(a.sessionId);
    expect(hand(restored)?.id).toBe(held.id);
    expect(snapshot(restored).countdown).toBe(0);
    await wait(() => snapshot(restored).remaining < paused);
    await restored.leave();
    await wait(() => !matchMaker.getLocalRoomById(restored.roomId));
  });
  it('synchronizes preparation countdown without consuming match time or items', async () => {
    const a = await track(new Client(endpoint).create('coop_private', { teamSize: 2 }));
    const b = await track(new Client(endpoint).joinById(a.roomId));
    a.send('intent', { type: 'ready', ready: true });
    b.send('intent', { type: 'ready', ready: true });
    await wait(() => snapshot(a).session!.members.every((m) => m.ready));
    a.send('intent', { type: 'start' });
    await wait(() => Boolean(snapshot(a).countdown) && Boolean(snapshot(b).countdown));
    const time = snapshot(a).remaining;
    a.send('intent', { type: 'interact', station: 'bun' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(snapshot(a).remaining).toBe(time);
    expect(hand(a)).toBeNull();
    await wait(() => !snapshot(a).countdown && snapshot(a).remaining < time);
  });
  it('continues a winning crew through the same room and keeps its members and streak', async () => {
    const [host, teammate] = await createPair('little-sun-01');
    const roomId = host.roomId;
    const internal = matchMaker.getLocalRoomById(roomId) as unknown as {
      session: {
        game: {
          matchId: string;
          state: {
            phase: Snapshot['phase'];
            result: NonNullable<Snapshot['result']> | null;
          };
        };
      };
    };
    const firstMatchId = internal.session.game.matchId;
    internal.session.game.state.phase = 'finished';
    internal.session.game.state.result = {
      levelId: 'little-sun-01',
      teamSize: 2,
      won: true,
      stars: 2,
      score: 500,
      served: 3,
      missed: 0,
      bestCombo: 2,
      averageService: 20,
      duration: 180,
      matchId: 'integration-team-win',
    };
    await wait(() => snapshot(host).result?.matchId === 'integration-team-win');
    await wait(() => snapshot(host).session!.teamStreak === 1);

    teammate.send('intent', { type: 'continue', levelId: 'little-sun-02' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(snapshot(host).phase).toBe('finished');

    host.send('intent', { type: 'continue', levelId: 'orbit-10' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(snapshot(host).phase).toBe('finished');

    host.send('intent', { type: 'continue', levelId: 'little-sun-02' });
    await wait(() =>
      [host, teammate].every(
        (client) =>
          snapshot(client).phase === 'lobby' && snapshot(client).levelId === 'little-sun-02',
      ),
    );
    expect(host.roomId).toBe(roomId);
    expect(teammate.roomId).toBe(roomId);
    expect(snapshot(host).result).toBeNull();
    expect(snapshot(host).session!.teamStreak).toBe(1);
    expect(internal.session.game.matchId).not.toBe(firstMatchId);
    expect(
      snapshot(host)
        .session!.members.map((m) => m.id)
        .sort(),
    ).toEqual([host.sessionId, teammate.sessionId].sort());

    const lateFriend = await track(new Client(endpoint).joinById(roomId));
    await wait(() => snapshot(host).session!.members.length === 3);
    host.send('intent', { type: 'ready', ready: true });
    teammate.send('intent', { type: 'ready', ready: true });
    lateFriend.send('intent', { type: 'ready', ready: true });
    await wait(() => snapshot(host).session!.members.every((member) => member.ready));
    host.send('intent', { type: 'start' });
    await wait(() =>
      [host, teammate, lateFriend].every((client) => snapshot(client).phase === 'playing'),
    );
    expect(snapshot(host).session!.startedSize).toBe(3);
    expect(snapshot(host).levelId).toBe('little-sun-02');
    await expect(new Client(endpoint).joinById(roomId)).rejects.toThrow();
  });
  it('lets a public crew continue with the connected group after one player leaves', async () => {
    const crew = [
      await track(
        new Client(endpoint).joinOrCreate('coop_public', {
          teamSize: 3,
          levelId: 'little-sun-01',
        }),
      ),
      await track(
        new Client(endpoint).joinOrCreate('coop_public', {
          teamSize: 3,
          levelId: 'little-sun-01',
        }),
      ),
      await track(
        new Client(endpoint).joinOrCreate('coop_public', {
          teamSize: 3,
          levelId: 'little-sun-01',
        }),
      ),
    ];
    for (const client of crew) client.send('intent', { type: 'ready', ready: true });
    await wait(() => crew.every((client) => snapshot(client).phase === 'playing'));
    await wait(() => !snapshot(crew[0]!).countdown);

    const internal = matchMaker.getLocalRoomById(crew[0]!.roomId) as unknown as {
      session: {
        game: {
          state: {
            phase: Snapshot['phase'];
            result: NonNullable<Snapshot['result']> | null;
          };
        };
      };
    };
    internal.session.game.state.phase = 'finished';
    internal.session.game.state.result = {
      levelId: 'little-sun-01',
      teamSize: 3,
      won: true,
      stars: 1,
      score: 500,
      served: 3,
      missed: 0,
      bestCombo: 1,
      averageService: 20,
      duration: 180,
      matchId: 'integration-public-win',
    };
    await wait(() => snapshot(crew[0]!).result?.matchId === 'integration-public-win');
    crew[0]!.send('intent', { type: 'continue', levelId: 'little-sun-02' });
    await wait(() => crew.every((client) => snapshot(client).phase === 'lobby'));

    await crew[2]!.leave();
    await wait(() => snapshot(crew[0]!).session!.members.length === 2);
    crew[0]!.send('intent', { type: 'ready', ready: true });
    crew[1]!.send('intent', { type: 'ready', ready: true });
    await wait(() => [crew[0]!, crew[1]!].every((client) => snapshot(client).phase === 'playing'));
    expect(snapshot(crew[0]!).session!.startedSize).toBe(2);
    expect(snapshot(crew[0]!).levelId).toBe('little-sun-02');
  });
  it('matches by level as well as team size and synchronizes a non-default kitchen', async () => {
    const a = await track(
      new Client(endpoint).joinOrCreate('coop_public', { teamSize: 2, levelId: 'tide-05' }),
    );
    const separate = await track(
      new Client(endpoint).joinOrCreate('coop_public', { teamSize: 2, levelId: 'orbit-10' }),
    );
    const b = await track(
      new Client(endpoint).joinOrCreate('coop_public', { teamSize: 2, levelId: 'tide-05' }),
    );
    expect(b.roomId).toBe(a.roomId);
    expect(separate.roomId).not.toBe(a.roomId);
    for (const r of [a, b]) r.send('intent', { type: 'ready', ready: true });
    await wait(() => snapshot(a).phase === 'playing' && snapshot(b).phase === 'playing');
    expect(snapshot(a).levelId).toBe('tide-05');
    expect(snapshot(b).stations.map((s) => [s.id, s.x, s.z])).toEqual(
      snapshot(a).stations.map((s) => [s.id, s.x, s.z]),
    );
    await act(a, 'meat');
    await act(a, 'stove');
    await wait(() => snapshot(b).stations.find((s) => s.id === 'stove')?.phase === 'ready');
    expect(snapshot(b).stations.find((s) => s.id === 'stove')?.item?.kind).toBe('tide-hot');
    await expect(
      new Client(endpoint).create('coop_private', { levelId: 'not-a-level' }),
    ).rejects.toThrow();
  });
  it('matches public teams by size and prevents a fifth member or late join', async () => {
    const a = await track(new Client(endpoint).joinOrCreate('coop_public', { teamSize: 2 }));
    const other = await track(new Client(endpoint).joinOrCreate('coop_public', { teamSize: 3 }));
    const b = await track(new Client(endpoint).joinOrCreate('coop_public', { teamSize: 2 }));
    expect(b.roomId).toBe(a.roomId);
    expect(other.roomId).not.toBe(a.roomId);
    a.send('intent', { type: 'ready', ready: true });
    b.send('intent', { type: 'ready', ready: true });
    await wait(() => snapshot(a).phase === 'playing');
    await expect(new Client(endpoint).joinById(a.roomId)).rejects.toThrow();
    const four = await track(new Client(endpoint).create('coop_private', { teamSize: 4 }));
    const team = [four];
    for (let i = 0; i < 3; i++) team.push(await track(new Client(endpoint).joinById(four.roomId)));
    await expect(new Client(endpoint).joinById(four.roomId)).rejects.toThrow();
    for (const r of team) r.send('intent', { type: 'ready', ready: true });
    await wait(() => snapshot(four).session!.members.every((m) => m.ready));
    four.send('intent', { type: 'start' });
    await wait(() => team.every((r) => snapshot(r).phase === 'playing'));
    expect(Object.keys(snapshot(four).chefs)).toHaveLength(4);
    expect(snapshot(four).session!.targetOrders).toBe(5);
    const trio = [
      other,
      await track(new Client(endpoint).joinOrCreate('coop_public', { teamSize: 3 })),
      await track(new Client(endpoint).joinOrCreate('coop_public', { teamSize: 3 })),
    ];
    expect(trio.every((r) => r.roomId === other.roomId)).toBe(true);
    for (const r of trio) r.send('intent', { type: 'ready', ready: true });
    await wait(() => trio.every((r) => snapshot(r).phase === 'playing'));
    expect(snapshot(other).session!.startedSize).toBe(3);
  });
  it('serializes simultaneous counter pickups without duplicate ownership', async () => {
    const [a, b] = await createPair();
    await expect(new Client(endpoint).joinById(a.roomId)).rejects.toThrow();
    await act(a, 'bun');
    await act(a, 'counter');
    const item = snapshot(a).stations.find((s) => s.id === 'counter')!.item!;
    a.send('intent', { type: 'interact', station: 'counter' });
    b.send('intent', { type: 'interact', station: 'counter' });
    await wait(() => [hand(a), hand(b)].filter((i) => i?.id === item.id).length === 1);
    await wait(() => !snapshot(b).chefs[b.sessionId].target);
    const s = snapshot(a);
    expect(
      [...Object.values(s.chefs).map((c) => c.item), ...s.stations.map((st) => st.item)].filter(
        (i) => i?.id === item.id,
      ),
    ).toHaveLength(1);
  });
  it('lets a teammate add freshly chopped lettuce to a shared plate in campaign level 3', async () => {
    const [prepChef, platingChef] = await createPair('little-sun-03');
    prepChef.send('intent', { type: 'selectRecipe', recipe: 'sunshine-chicken-burger' });
    await wait(
      () =>
        snapshot(platingChef).chefs[prepChef.sessionId]?.preferredRecipe ===
        'sunshine-chicken-burger',
    );

    await act(platingChef, 'rack');
    await act(platingChef, 'assembly');
    await act(prepChef, 'lettuce');
    await act(prepChef, 'board');
    for (let tap = 0; tap < 3; tap++) await act(prepChef, 'board');
    await wait(
      () => snapshot(platingChef).stations.find((s) => s.id === 'board')?.phase === 'ready',
    );
    await act(prepChef, 'board');
    expect(hand(prepChef)?.kind).toBe('choppedLettuce');

    await act(prepChef, 'assembly');
    await wait(() => {
      const plate = snapshot(platingChef).stations.find((s) => s.id === 'assembly')?.item;
      return plate?.parts.includes('choppedLettuce') ?? false;
    });
    const sharedPlate = snapshot(platingChef).stations.find((s) => s.id === 'assembly')!.item!;
    expect(sharedPlate.assemblyRecipe).toBe('sunshine-chicken-burger');
    expect(sharedPlate.parts).toContain('choppedLettuce');
    expect(hand(prepChef)).toBeNull();
  });
  it('serializes simultaneous occupied-counter deposits and stove starts', async () => {
    const [a, b] = await createPair();
    await Promise.all([act(a, 'meat'), act(b, 'meat')]);
    const ids = [hand(a)!.id, hand(b)!.id];
    a.send('intent', { type: 'interact', station: 'counter' });
    b.send('intent', { type: 'interact', station: 'counter' });
    await wait(
      () =>
        snapshot(a).stations.find((s) => s.id === 'counter')!.item !== null &&
        !snapshot(a).chefs[a.sessionId].target &&
        !snapshot(a).chefs[b.sessionId].target,
    );
    const loser = hand(a) ? a : b,
      winner = hand(a) ? b : a;
    expect(hand(loser)?.kind).toBe('meat');
    await act(winner, 'counter');
    expect([hand(a)!.id, hand(b)!.id].sort()).toEqual(ids.sort());
    a.send('intent', { type: 'interact', station: 'stove' });
    b.send('intent', { type: 'interact', station: 'stove' });
    await wait(
      () =>
        !snapshot(a).chefs[a.sessionId].target &&
        !snapshot(a).chefs[b.sessionId].target &&
        snapshot(a).stations.find((s) => s.id === 'stove')!.phase === 'processing',
    );
    expect([hand(a), hand(b)].filter(Boolean)).toHaveLength(1);
    expect(snapshot(a).stations.find((s) => s.id === 'stove')!.item?.kind).toBe('meat');
  });
  it('transfers host, keeps cooking and reconnects with the same item and chef', async () => {
    const [a, b] = await createPair();
    await act(a, 'meat');
    await act(a, 'stove');
    await act(a, 'rack');
    const item = hand(a)!;
    const token = a.reconnectionToken;
    a.reconnection.enabled = false;
    a.connection.close();
    await wait(
      () => snapshot(b).session!.host === b.sessionId && !snapshot(b).chefs[a.sessionId].connected,
    );
    const elapsed = snapshot(b).elapsed;
    const restored = await track(new Client(endpoint).reconnect(token));
    expect(restored.sessionId).toBe(a.sessionId);
    await wait(() => snapshot(restored).chefs[a.sessionId].connected);
    expect(hand(restored)?.id).toBe(item.id);
    expect(snapshot(restored).session!.startedSize).toBe(2);
    expect(snapshot(restored).elapsed).toBeGreaterThanOrEqual(elapsed);
    expect(snapshot(restored).stations.find((s) => s.id === 'stove')!.elapsed).toBeGreaterThan(0);
  });
  it('recovers inventory after explicit leave and after the actual reconnect window expires', async () => {
    const [a, b] = await createPair();
    await act(a, 'rack');
    const plate = hand(a)!;
    await a.leave();
    await wait(() => !snapshot(b).chefs[a.sessionId]);
    expect(snapshot(b).stations.find((s) => s.id === 'counter')!.item?.id).toBe(plate.id);
    await act(b, 'counter');
    expect(hand(b)?.id).toBe(plate.id);
    const [c, d] = await createPair();
    await act(c, 'rack');
    const held = hand(c)!;
    c.reconnection.enabled = false;
    c.connection.close();
    await wait(() => !snapshot(d).chefs[c.sessionId], 25000);
    expect(snapshot(d).stations.find((s) => s.id === 'counter')!.item?.id).toBe(held.id);
  });
  it('rejects spoofed score, pause, direct finish and free chat while syncing allowed signals', async () => {
    const [a, b] = await createPair();
    a.send('intent', { type: 'finish', score: 99999 });
    a.send('intent', { type: 'pause' });
    a.send('intent', { type: 'quickChat', value: 'untrusted text' });
    a.send('intent', { type: 'ping', value: 'stove' });
    await wait(() =>
      snapshot(b).session!.signals.some((s) => s.type === 'ping' && s.value === 'stove'),
    );
    expect(snapshot(b).phase).toBe('playing');
    expect(snapshot(b).score).toBe(0);
    expect(snapshot(b).session!.signals).toHaveLength(1);
  });
});
