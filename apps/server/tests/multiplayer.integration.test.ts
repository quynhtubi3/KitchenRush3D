import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import { CoopRoom } from '../src/rooms/CoopRoom';
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
async function createPair() {
  const a = await track(new Client(endpoint).create('coop_private', { teamSize: 4 }));
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
