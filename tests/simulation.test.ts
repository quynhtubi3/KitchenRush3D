import { describe, it, expect } from 'vitest';
import { Game } from '../apps/server/src/simulation/game';
import { findPath } from '../apps/server/src/simulation/pathfinding';
import { burger, recipeSchema, validateContent } from '../packages/content/src/index';
import type { Item } from '../packages/shared/src/types';

function create(config: ConstructorParameters<typeof Game>[0] = {}) {
  const g = new Game(config, 'test-match');
  g.addChef('chef');
  return g;
}
function advance(g: Game, seconds: number) {
  for (let s = 0; s < seconds - 0.00001; s += 0.05) g.tick(Math.min(0.05, seconds - s));
}
function act(g: Game, station: string, id = 'chef') {
  g.intent(id, { type: 'interact', station });
  for (let i = 0; i < 200 && g.state.chefs[id].target; i++) g.tick(0.05);
}
function hand(g: Game) {
  return g.state.chefs.chef.item;
}
function countPlates(g: Game) {
  const all = [
    ...Object.values(g.state.chefs).map((c) => c.item),
    ...g.state.stations.flatMap((s) => [s.item, ...s.stock]),
  ].filter((x): x is Item => !!x);
  return all.filter((x) => ['plate', 'burger', 'dirtyPlate'].includes(x.kind)).length;
}
function cook(g: Game) {
  act(g, 'rack');
  act(g, 'assembly');
  act(g, 'meat');
  act(g, 'stove');
  act(g, 'lettuce');
  act(g, 'board');
  act(g, 'board');
  act(g, 'board');
  act(g, 'board');
  act(g, 'board');
  act(g, 'assembly');
  advance(g, Math.max(0, 7 - g.station('stove').elapsed));
  act(g, 'stove');
  act(g, 'assembly');
  act(g, 'bun');
  act(g, 'assembly');
  act(g, 'assembly');
  expect(hand(g)?.kind).toBe('burger');
}
describe('content and routes', () => {
  it('validates content and rejects missing dependencies and cycles', () => {
    expect(validateContent).not.toThrow();
    const missing = structuredClone(burger);
    missing.steps[0].dependsOn = ['missing'];
    expect(recipeSchema.safeParse(missing).success).toBe(false);
    const cycle = structuredClone(burger);
    cycle.steps[0].dependsOn = ['assemble'];
    expect(recipeSchema.safeParse(cycle).success).toBe(false);
  });
  it('routes around obstacles and rejects walls, occupied cells and out-of-bounds', () => {
    const g = create();
    const path = findPath({ x: 5, z: 5 }, { x: 7, z: 5 }, g.blocked)!;
    expect(path.length).toBeGreaterThan(2);
    expect(path.some((p) => p.x === 6 && p.z === 5)).toBe(false);
    expect(findPath({ x: 7, z: 8 }, { x: 6, z: 5 }, g.blocked)).toBeNull();
    expect(findPath({ x: 7, z: 8 }, { x: -10, z: 5 }, g.blocked)).toBeNull();
  });
  it('does not interact until arriving and replaces pending intent', () => {
    const g = create();
    g.intent('chef', { type: 'interact', station: 'meat' });
    expect(hand(g)).toBeNull();
    g.intent('chef', { type: 'move', x: 7, z: 7 });
    advance(g, 3);
    expect(hand(g)).toBeNull();
  });
});
describe('inventory and cooking', () => {
  it('holds one item, preserves invalid input and never spoils raw food', () => {
    const g = create({ duration: 500, patience: 400 });
    act(g, 'meat');
    const item = hand(g);
    act(g, 'lettuce');
    act(g, 'sink');
    advance(g, 100);
    expect(hand(g)).toEqual(item);
    expect(item?.kind).toBe('meat');
  });
  it('serializes competing pickups and deposits without duplicating items', () => {
    const g = create();
    g.addChef('other');
    act(g, 'meat');
    act(g, 'counter');
    const id = g.station('counter').item!.id;
    act(g, 'counter', 'other');
    act(g, 'counter');
    expect(g.state.chefs.other.item?.id).toBe(id);
    expect(hand(g)).toBeNull();
    act(g, 'lettuce');
    act(g, 'counter');
    act(g, 'counter', 'other');
    expect(g.station('counter').item?.kind).toBe('lettuce');
    expect(g.state.chefs.other.item?.id).toBe(id);
  });
  it('requires three active cuts and a separate pickup', () => {
    const g = create();
    act(g, 'lettuce');
    act(g, 'board');
    expect(g.station('board').item?.kind).toBe('lettuce');
    advance(g, 3);
    expect(g.station('board').progress).toBe(0);
    act(g, 'board');
    act(g, 'board');
    expect(g.station('board').item?.kind).toBe('lettuce');
    act(g, 'board');
    expect(hand(g)).toBeNull();
    act(g, 'board');
    expect(hand(g)?.kind).toBe('choppedLettuce');
  });
  it('cooks while chef is away, burns and can be trashed without penalty', () => {
    const g = create();
    act(g, 'meat');
    act(g, 'stove');
    advance(g, 7.1);
    expect(g.station('stove').phase).toBe('ready');
    advance(g, 14);
    expect(g.station('stove').phase).toBe('burnt');
    act(g, 'stove');
    act(g, 'trash');
    expect(hand(g)).toBeNull();
    expect(g.state.score).toBe(0);
  });
  it('does not consume duplicate or incorrect ingredients on a plate', () => {
    const g = create();
    act(g, 'rack');
    act(g, 'assembly');
    act(g, 'bun');
    act(g, 'assembly');
    act(g, 'bun');
    act(g, 'assembly');
    expect(hand(g)?.kind).toBe('bun');
    expect(g.station('assembly').item?.parts).toEqual(['bun']);
  });
});
describe('complete service and plate lifecycle', () => {
  it('serves, waits for eating, blocks seat, washes and reuses the same plate', () => {
    const g = create();
    cook(g);
    const plateId = hand(g)!.id;
    act(g, 'seat1');
    expect(g.state.served).toBe(1);
    expect(hand(g)).toBeNull();
    expect(g.state.customers.find((c) => c.seat === 'seat1')?.state).toBe('Eating');
    advance(g, 7);
    expect(g.station('seat1').item?.kind).toBe('dirtyPlate');
    expect(g.state.customers.some((c) => c.seat === 'seat1')).toBe(false);
    expect(countPlates(g)).toBe(2);
    act(g, 'seat1');
    expect(hand(g)?.id).toBe(plateId);
    act(g, 'trash');
    expect(hand(g)?.kind).toBe('dirtyPlate');
    act(g, 'sink');
    expect(hand(g)).toBeNull();
    advance(g, 5.1);
    expect(g.station('sink').item?.kind).toBe('plate');
    act(g, 'sink');
    expect(hand(g)?.id).toBe(plateId);
    act(g, 'rack');
    expect(countPlates(g)).toBe(2);
    expect(g.station('rack').stock.length).toBe(2);
  });
  it('rejects wrong customer without destroying food', () => {
    const g = create({ spawnSeconds: 500 });
    cook(g);
    const held = hand(g);
    act(g, 'seat2');
    expect(hand(g)).toEqual(held);
    expect(g.state.served).toBe(0);
  });
  it('keeps dirty plates and admits the first queued guest when picked up', () => {
    const g = create({ spawnSeconds: 3, patience: 400, queuePatience: 400 });
    cook(g);
    act(g, 'seat1');
    advance(g, 7);
    const queued = g.state.customers.find((c) => c.state === 'Queueing')!;
    expect(queued).toBeTruthy();
    expect(g.state.customers.some((c) => c.seat === 'seat1')).toBe(false);
    act(g, 'seat1');
    expect(queued.seat).toBe('seat1');
    expect(hand(g)?.kind).toBe('dirtyPlate');
  });
  it('bounds queue size and resets combo on patience expiry', () => {
    const g = create({ spawnSeconds: 1, patience: 2, queuePatience: 2, queueLimit: 2 });
    g.state.combo = 3;
    advance(g, 10);
    expect(g.state.customers.filter((c) => !c.seat).length).toBeLessThanOrEqual(2);
    expect(g.state.missed).toBeGreaterThan(0);
    expect(g.state.combo).toBe(0);
  });
  it('preserves clean plates when trash is clicked', () => {
    const g = create();
    act(g, 'rack');
    const item = hand(g);
    act(g, 'trash');
    expect(hand(g)).toEqual(item);
    expect(countPlates(g)).toBe(2);
  });
});
describe('clock, score and results', () => {
  it('wins through actual gameplay, allows continued play, and finishes idempotently', () => {
    const g = create();
    cook(g);
    act(g, 'seat1');
    cook(g);
    act(g, 'seat2');
    expect(g.canWin()).toBe(true);
    expect(g.state.phase).toBe('playing');
    g.intent('chef', { type: 'finish' });
    expect(g.state.result?.won).toBe(true);
    expect(g.state.result?.stars).toBeGreaterThanOrEqual(1);
    const result = structuredClone(g.state.result);
    g.intent('chef', { type: 'finish' });
    advance(g, 20);
    expect(g.state.result).toEqual(result);
  });
  it('requires both score and orders and refuses early failure', () => {
    const g = create({ duration: 1 });
    g.state.score = 1000;
    g.intent('chef', { type: 'finish' });
    expect(g.state.result).toBeNull();
    advance(g, 1.1);
    expect(g.state.result?.won).toBe(false);
    expect(g.state.result?.stars).toBe(0);
  });
  it('pauses timers and freezes actions after finish', () => {
    const g = create();
    act(g, 'meat');
    act(g, 'stove');
    g.intent('chef', { type: 'pause' });
    const before = JSON.stringify(g.state);
    advance(g, 30);
    expect(JSON.stringify(g.state)).toBe(before);
    g.intent('chef', { type: 'pause' });
    advance(g, 180);
    const end = JSON.stringify(g.state);
    act(g, 'stove');
    expect(JSON.stringify(g.state)).toBe(end);
  });
  it('uses speed, missed guests and combo for the third star', () => {
    const g = create();
    g.state.score = 800;
    g.state.served = 6;
    g.state.bestCombo = 3;
    g.intent('chef', { type: 'finish' });
    expect(g.state.result?.stars).toBe(3);
    const bad = create();
    bad.state.score = 800;
    bad.state.served = 6;
    bad.state.bestCombo = 1;
    bad.state.missed = 4;
    bad.intent('chef', { type: 'finish' });
    expect(bad.state.result?.stars).toBe(2);
  });
  it('rejects malformed movement and unknown players', () => {
    const g = create();
    g.intent('chef', { type: 'move', x: NaN, z: Infinity });
    g.intent('intruder', { type: 'finish' });
    expect(g.state.chefs.chef.path).toEqual([]);
    expect(g.state.result).toBeNull();
  });
});
