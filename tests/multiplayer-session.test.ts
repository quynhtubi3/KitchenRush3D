import { describe, it, expect } from 'vitest';
import { KitchenSession, teamConfig } from '../apps/server/src/multiplayer/session';
const lobby = (visibility: 'private' | 'public' = 'private', size = 4) => {
  const s = new KitchenSession('room', visibility, size);
  s.join('a');
  s.join('b');
  return s;
};
function start(s: KitchenSession) {
  for (const m of s.info.members) s.command(m.id, { type: 'ready', ready: true });
  if (s.game.state.phase === 'lobby') s.command(s.info.host, { type: 'start' });
}
describe('multiplayer session rules', () => {
  it('requires host, ready, valid content and 2–4 connected members', () => {
    const s = lobby();
    expect(s.command('b', { type: 'start' })).toBe('notReady');
    expect(s.command('a', { type: 'start' })).toBe('notReady');
    expect(s.command('b', { type: 'selectLevel', levelId: 'little-sun-01' })).toBe(
      'invalidCommand',
    );
    expect(s.command('a', { type: 'selectLevel', levelId: 'fake' })).toBe('invalidCommand');
    s.command('a', { type: 'ready', ready: true });
    s.command('a', { type: 'selectLevel', levelId: 'little-sun-01' });
    expect(s.info.members[0].ready).toBe(false);
    start(s);
    expect(s.game.state.phase).toBe('playing');
    expect(s.info.startedSize).toBe(2);
    expect(() => s.join('late')).toThrow();
  });
  it('public matching waits for the selected full team then starts automatically', () => {
    const s = lobby('public', 3);
    start(s);
    expect(s.game.state.phase).toBe('lobby');
    s.join('c');
    expect(s.info.members.every((m) => !m.ready)).toBe(true);
    start(s);
    expect(s.game.state.phase).toBe('playing');
    expect(s.game.config.targetOrders).toBe(4);
  });
  it('cannot pause or finish directly and needs every active vote after both goals', () => {
    const s = lobby();
    start(s);
    expect(s.command('a', { type: 'pause' })).toBe('invalidCommand');
    expect(s.command('a', { type: 'finish' })).toBe('invalidCommand');
    expect(s.command('a', { type: 'voteFinish', agree: true })).toBe('goalsRequired');
    s.game.state.score = 1000;
    s.game.state.served = 5;
    s.command('a', { type: 'voteFinish', agree: true });
    expect(s.game.state.phase).toBe('playing');
    s.command('a', { type: 'voteFinish', agree: false });
    expect(s.info.votes).toEqual([]);
    s.command('b', { type: 'voteFinish', agree: true });
    s.command('a', { type: 'voteFinish', agree: true });
    expect(s.game.state.result?.won).toBe(true);
    expect(s.game.state.result?.teamSize).toBe(2);
  });
  it('elects a connected host and preserves frozen difficulty through disconnects', () => {
    const s = lobby();
    start(s);
    const config = structuredClone(s.game.config);
    s.connection('a', false);
    expect(s.info.host).toBe('b');
    s.tick(1);
    expect(s.game.state.elapsed).toBe(1);
    s.connection('a', true);
    expect(s.info.host).toBe('b');
    expect(s.game.config).toEqual(config);
    expect(s.info.startedSize).toBe(2);
  });
  it('removes a dropped voter without wedging consensus and never finalizes with no active members', () => {
    const s = lobby();
    start(s);
    s.game.state.score = 1000;
    s.game.state.served = 5;
    s.command('b', { type: 'voteFinish', agree: true });
    s.connection('a', false);
    expect(s.game.state.phase).toBe('finished');
    const empty = lobby();
    start(empty);
    empty.game.state.score = 1000;
    empty.game.state.served = 5;
    empty.connection('a', false);
    empty.connection('b', false);
    expect(empty.game.state.phase).toBe('playing');
  });
  it('recovers held dirty dishes and ingredients exactly once even when the counter is occupied', () => {
    const s = lobby();
    start(s);
    s.game.station('counter').item = { id: 'original', kind: 'bun', parts: [] };
    s.game.state.chefs.a.item = { id: 'dirty', kind: 'dirtyPlate', parts: [] };
    s.game.state.chefs.b.item = { id: 'meat', kind: 'meat', parts: [] };
    s.leave('a');
    s.leave('a');
    s.leave('b');
    expect(s.game.station('counter').stock.map((i) => i.id)).toEqual(['dirty', 'meat']);
    expect(s.game.station('counter').item?.id).toBe('original');
  });
  it('validates and rate-limits canned communication and expires signals', () => {
    const s = lobby();
    expect(s.command('a', { type: 'quickChat', value: 'free text' })).toBe('invalidCommand');
    expect(s.command('a', { type: 'ping', value: 'fake' })).toBe('invalidCommand');
    expect(
      s.command('a', { type: 'emote', value: 'wave', text: 'not a chat channel', from: 'spoofed' }),
    ).toBeNull();
    expect(s.info.signals[0].from).toBe('a');
    expect(s.info.signals[0]).not.toHaveProperty('text');
    expect(s.command('a', { type: 'ping', value: 'stove' })).toBe('rateLimited');
    s.info.signals[0].expires = Date.now() - 1;
    s.tick(0.05);
    expect(s.info.signals).toHaveLength(0);
  });
  it('keeps the starting team configuration bounded and independent of client data', () => {
    for (const n of [2, 3, 4]) {
      const c = teamConfig(n);
      expect(c.plates).toBeLessThanOrEqual(4);
      expect(c.targetOrders).toBe(n + 1);
    }
    const s = lobby();
    start(s);
    s.command('a', { type: 'move', x: NaN, z: Infinity, score: 100000 });
    expect(s.game.state.score).toBe(0);
    expect(s.game.state.chefs.a.path).toEqual([]);
  });
});
