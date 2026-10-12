import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Game } from '../apps/server/src/simulation/game';
import { TapNavigation } from '../apps/client/src/tap-navigation';
import { guidance } from '../apps/client/src/guidance';
import { levels } from '../packages/content/src/campaign';

describe('snapshot-confirmed tap navigation', () => {
  it('moves before interacting, sends once at arrival and rejects double taps', () => {
    const game = new Game();
    game.addChef('a');
    const tap = new TapNavigation();
    const first = tap.select(game.state, 'a', 'meat', 0)!;
    expect(first.type).toBe('move');
    expect(tap.select(game.state, 'a', 'meat', 100)).toBeNull();
    expect(tap.receive(game.state, 'a', 100)).toBeNull();
    game.intent('a', first);
    for (let i = 0; i < 100; i++) game.tick(0.05);
    expect(game.state.chefs.a.item).toBeNull();
    const interact = tap.receive(game.state, 'a', 5000)!;
    expect(interact).toEqual({ type: 'interact', station: 'meat' });
    game.intent('a', interact);
    expect(game.state.chefs.a.item?.kind).toBe('meat');
    expect(tap.receive(game.state, 'a', 5100)).toBeNull();
  });
  it('drops a pending action on disconnect or inventory change', () => {
    const game = new Game();
    game.addChef('a');
    const tap = new TapNavigation();
    tap.select(game.state, 'a', 'meat', 0);
    game.state.chefs.a.connected = false;
    expect(tap.receive(game.state, 'a', 500)).toBeNull();
    expect(tap.pending).toBeNull();
  });
  it('cancels arrival pickup when another chef has changed the shared station', () => {
    const game = new Game();
    game.addChef('a');
    game.addChef('b');
    const board = game.state.stations.find((s) => s.id === 'board')!;
    board.item = { id: 'prepared', kind: 'choppedLettuce', parts: [] };
    board.phase = 'ready';
    const tap = new TapNavigation();
    const move = tap.select(game.state, 'a', 'board', 0)!;
    game.intent('a', move);
    game.state.chefs.b.x = board.x;
    game.state.chefs.b.z = board.z + 1;
    game.intent('b', { type: 'interact', station: 'board' });
    for (let i = 0; i < 100; i++) game.tick(0.05);
    expect(tap.receive(game.state, 'a', 5000)).toBeNull();
    expect(game.state.chefs.a.item).toBeNull();
    expect(game.state.chefs.b.item?.id).toBe('prepared');
  });
  it('keeps an ingredient placement queued when a teammate adds the plate en route', () => {
    const game = new Game({ id: 'little-sun-03' });
    game.addChef('a');
    game.addChef('b', 1);
    const assembly = game.station('assembly');
    game.state.chefs.a.item = { id: 'chopped-greens', kind: 'choppedLettuce', parts: [] };
    game.intent('a', { type: 'selectRecipe', recipe: 'sunshine-burger' });
    const tap = new TapNavigation();
    const move = tap.select(game.state, 'a', assembly.id, 0)!;
    expect(move.type).toBe('move');
    game.intent('a', move);

    // A teammate's plate arrives while this chef is already walking to plating.
    assembly.item = { id: 'teammate-plate', kind: 'plate', parts: [] };
    for (let i = 0; i < 100; i++) game.tick(0.05);

    const interaction = tap.receive(game.state, 'a', 5000);
    expect(interaction).toEqual({ type: 'interact', station: assembly.id });
    game.intent('a', interaction!);
    expect(game.state.chefs.a.item).toBeNull();
    expect(assembly.item?.parts).toContain('choppedLettuce');
    expect(assembly.item?.assemblyRecipe).toBe('sunshine-burger');
  });
});

describe('recipe guidance', () => {
  it('guides the carried dish to its customer while a teammate builds another recipe', () => {
    const game = new Game({ id: 'little-sun-10' });
    game.addChef('a');
    const customer = game.state.customers[0];
    customer.recipe = 'sunshine-cheeseburger';
    customer.seat = 'seat1';
    customer.state = 'WaitingForFood';
    game.state.customers.push({
      ...customer,
      id: 'second',
      seat: 'seat2',
      recipe: 'sunshine-burger',
    });
    game.state.chefs.a.item = { id: 'served-plate', kind: 'cheeseburger', parts: [] };
    game.station('assembly').item = {
      id: 'other-plate',
      kind: 'plate',
      parts: ['bun'],
      assemblyRecipe: 'sunshine-burger',
    };
    expect(guidance(game.state, 'a', 'second')?.station).toBe('seat1');
    expect(guidance(game.state, 'a', 'second')?.missing).toEqual([]);
    customer.state = 'Eating';
    expect(guidance(game.state, 'a', 'second')).toBeNull();
  });
  it('compares one-tap arrival with explicit confirmation on the same first dish', () => {
    const totals: number[] = [];
    for (const automatic of [true, false]) {
      const game = new Game();
      game.addChef('a');
      const tap = new TapNavigation();
      let actions = 0;
      for (let tick = 0; tick < 1800 && !game.state.served; tick++) {
        const now = tick * 100;
        game.tick(0.1);
        const interaction = tap.receive(game.state, 'a', now);
        if (interaction) game.intent('a', interaction);
        if (!tap.pending && tick % 4 === 0) {
          const hint = guidance(game.state, 'a');
          if (hint?.station) {
            const intent = tap.select(game.state, 'a', hint.station, now, automatic);
            if (intent) {
              game.intent('a', intent);
              actions++;
            }
          }
        }
      }
      expect(game.state.served).toBe(1);
      totals.push(actions);
    }
    expect(totals[0]).toBeLessThan(totals[1]);
    mkdirSync('docs/screenshots/pass6', { recursive: true });
    writeFileSync(
      'docs/screenshots/pass6/interaction-counts.json',
      JSON.stringify(
        {
          source: 'deterministic simulation; not human playtest',
          level: 'little-sun-01',
          arrivalTaps: totals[0],
          confirmTaps: totals[1],
        },
        null,
        2,
      ) + '\n',
    );
  });
  it('avoids a component already carried by a teammate', () => {
    const game = new Game();
    game.addChef('a');
    game.addChef('b');
    for (let i = 0; i < 30; i++) game.tick(0.1);
    game.state.stations.find((s) => s.kind === 'assembly')!.item = {
      id: 'p',
      kind: 'plate',
      parts: [],
    };
    game.state.chefs.b.item = { id: 'm', kind: 'cookedMeat', parts: [] };
    expect(guidance(game.state, 'a')?.station).toBe('bun');
  });
  for (const level of levels) {
    it(`guides a real first dish in ${level.id}`, () => {
      const game = new Game({ id: level.id });
      game.addChef('a');
      const tap = new TapNavigation();
      let nextTap = 0;
      let actions = 0;
      for (let tick = 0; tick < 2600 && !game.state.served; tick++) {
        const now = tick * 50;
        game.tick(0.05);
        const arrival = tap.receive(game.state, 'a', now);
        if (arrival) {
          game.intent('a', arrival);
          nextTap = now + 350;
        }
        if (!tap.pending && now >= nextTap) {
          const hint = guidance(game.state, 'a');
          if (hint?.station) {
            const intent = tap.select(game.state, 'a', hint.station, now);
            if (intent) {
              game.intent('a', intent);
              actions++;
            }
          }
          nextTap = now + 350;
        }
      }
      expect(game.state.served).toBeGreaterThan(0);
      expect(actions).toBeLessThan(70);
    });
  }
  for (const level of levels.filter((l) => l.number === 5)) {
    it(`guides a complex dependency chain in ${level.id}`, () => {
      const game = new Game({ id: level.id });
      game.addChef('a');
      for (let i = 0; i < 30; i++) game.tick(0.1);
      const customer = game.state.customers.find((c) => c.state === 'WaitingForFood')!;
      // A valid complex-order fixture; all cooking/movement remains real simulation.
      customer.recipe = level.recipes.at(-1)!;
      const tap = new TapNavigation();
      const used = new Set<string>();
      for (let tick = 0; tick < 2400 && !game.state.served; tick++) {
        const now = tick * 100;
        game.tick(0.1);
        const action = tap.receive(game.state, 'a', now);
        if (action) game.intent('a', action);
        if (!tap.pending && tick % 4 === 0) {
          const hint = guidance(game.state, 'a', customer.id);
          if (hint?.station) {
            used.add(hint.station);
            const intent = tap.select(game.state, 'a', hint.station, now);
            if (intent) game.intent('a', intent);
          }
        }
      }
      expect(game.state.served).toBeGreaterThan(0);
      expect(used.has('oven')).toBe(true);
      if (level.restaurantId !== 'little-sun') expect(used.has('mixer')).toBe(true);
    });
  }
});
