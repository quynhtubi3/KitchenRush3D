import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server, matchMaker, type Client as ServerClient } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { CoopRoom } from '../src/rooms/CoopRoom';
import type { KitchenSession } from '../src/multiplayer/session';

const { submitted } = vi.hoisted(() => ({ submitted: vi.fn() }));
vi.mock('../src/persistence/match-persistence', () => ({ submitMatch: submitted }));

// Identity injection exists only in this test server, never in the game protocol.
class AuthenticatedTestRoom extends CoopRoom {
  async onAuth(client: ServerClient) {
    return { playerId: client.sessionId };
  }
}
const http = createServer();
let server: Server, endpoint: string;
const rooms: Room[] = [];
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
beforeAll(async () => {
  server = new Server({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport({ server: http }),
  });
  server.define('coop_private', AuthenticatedTestRoom);
  await server.listen(0, '127.0.0.1');
  endpoint = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const room of rooms) if (room.connection.isOpen) await room.leave();
  await server.gracefullyShutdown(false);
});

it('excludes a lobby visitor, retains a started leaver/reconnected chef and submits only once', async () => {
  const host = await track(new Client(endpoint).create('coop_private', { teamSize: 4 }));
  const visitor = await track(new Client(endpoint).joinById(host.roomId));
  await visitor.leave();
  await wait(() => snapshot(host).session.members.length === 1);
  const leaver = await track(new Client(endpoint).joinById(host.roomId));
  const dropped = await track(new Client(endpoint).joinById(host.roomId));
  for (const room of [host, leaver, dropped]) room.send('intent', { type: 'ready', ready: true });
  await wait(() => snapshot(host).session.members.every((m: { ready: boolean }) => m.ready));
  host.send('intent', { type: 'start' });
  await wait(() => snapshot(host).phase === 'playing' && !snapshot(host).countdown);
  await leaver.leave();
  dropped.connection.close();
  await wait(() => !snapshot(host).chefs[dropped.sessionId].connected);
  const restored = await track(new Client(endpoint).reconnect(dropped.reconnectionToken));
  expect(restored.sessionId).toBe(dropped.sessionId);
  // Finish using the real server simulation, with an accelerated remaining clock.
  const local = matchMaker.getLocalRoomById(host.roomId) as unknown as { session: KitchenSession };
  local.session.game.state.remaining = 0.01;
  await wait(() => snapshot(host).phase === 'finished');
  expect(submitted).toHaveBeenCalledTimes(1);
  expect(submitted.mock.calls[0][1].sort()).toEqual(
    [host.sessionId, leaver.sessionId, dropped.sessionId].sort(),
  );
  expect(submitted.mock.calls[0][1]).not.toContain(visitor.sessionId);
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(submitted).toHaveBeenCalledTimes(1);
  await host.leave();
  await restored.leave();
  await wait(() => !matchMaker.getLocalRoomById(host.roomId));
  expect(submitted.mock.calls[0][1]).toHaveLength(3);
});
