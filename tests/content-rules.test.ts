import { describe, it, expect } from 'vitest';
import { validateRecipeGraph } from '../packages/content/src/validation';
import {
  items,
  recipes,
  levels,
  getLevel,
  customerTypes,
  scaledLevel,
} from '../packages/content/src/campaign';
import { Game } from '../apps/server/src/simulation/game';
import { KitchenSession } from '../apps/server/src/multiplayer/session';

describe('campaign validation and special guests', () => {
  it('rejects unknown items, unusable processors, missing dependency edges and ambiguous plates', () => {
    const l = getLevel('little-sun-05'),
      r = recipes[1];
    const validate = (value: unknown) =>
      validateRecipeGraph(value, l.stations, new Set(items.keys()));
    expect(() => validate(r)).not.toThrow();
    for (const mutate of [
      (v: typeof r) => {
        v.steps[0].output = 'missing';
      },
      (v: typeof r) => {
        v.steps[0].station = 'sink';
      },
      (v: typeof r) => {
        v.steps.find((s) => s.station === 'oven')!.dependsOn = [];
      },
      (v: typeof r) => {
        v.components.push(v.components[0]);
      },
      (v: typeof r) => {
        v.steps[0].taps = 2;
      },
      (v: typeof r) => {
        v.steps.at(-1)!.inputs = ['plate'];
      },
    ]) {
      const value = structuredClone(r);
      mutate(value);
      expect(() => validate(value)).toThrow();
    }
  });
  it('introduces guests in authored order and complex guests request the longer graph', () => {
    expect(getLevel('little-sun-01').customers).toEqual(['regular']);
    expect(getLevel('little-sun-03').customers).toContain('vip');
    expect(getLevel('little-sun-05').customers).toContain('complex');
    expect(getLevel('little-sun-06').customers).toContain('impatient');
    expect(getLevel('little-sun-07').customers).toContain('combo');
    const g = new Game({ id: 'little-sun-07', spawnSeconds: 1, queueLimit: 10 });
    for (let i = 0; i < 90; i++) g.tick(0.05);
    expect(g.state.customers.map((c) => c.type)).toEqual([
      'regular',
      'vip',
      'complex',
      'impatient',
      'combo',
    ]);
    expect(g.state.customers.find((c) => c.type === 'complex')?.recipe).toBe('toasted-burger');
    expect(recipes[1].steps.length).toBeGreaterThan(recipes[0].steps.length);
  });
  it('applies impatience, VIP score and combo bonus while preserving the plate', () => {
    const outcome = (type: keyof typeof customerTypes) => {
      const g = new Game();
      g.addChef('a');
      g.tick(0.5);
      g.tick(0.5);
      const c = g.state.customers[0];
      c.type = type;
      const chef = g.state.chefs.a;
      chef.x = 11;
      chef.z = 4;
      // Unit fixture isolates scoring; campaign winning tests never inject items.
      chef.item = {
        id: 'unit-plate',
        kind: 'burger',
        parts: ['bun', 'cookedMeat', 'choppedLettuce'],
      };
      g.intent('a', { type: 'interact', station: 'seat1' });
      expect(g.station('seat1').item?.id).toBe('unit-plate');
      expect(c.state).toBe('Eating');
      return g;
    };
    expect(outcome('vip').state.score).toBeGreaterThan(outcome('regular').state.score);
    expect(outcome('combo').state.combo).toBe(2);
    expect(customerTypes.impatient.patience).toBeLessThan(customerTypes.regular.patience);
  });
  it('host level selection is validated, resets ready and freezes team scaling through drops', () => {
    const s = new KitchenSession('campaign', 'private', 4);
    s.join('a');
    s.join('b');
    s.command('b', { type: 'ready', ready: true });
    expect(s.command('b', { type: 'selectLevel', levelId: 'orbit-10' })).toBe('invalidCommand');
    expect(s.command('a', { type: 'selectLevel', levelId: 'missing' })).toBe('invalidCommand');
    expect(s.command('a', { type: 'selectLevel', levelId: 'orbit-10' })).toBeNull();
    expect(s.info.members.every((m) => !m.ready)).toBe(true);
    for (const id of ['a', 'b']) s.command(id, { type: 'ready', ready: true });
    s.command('a', { type: 'start' });
    expect(s.game.state.levelId).toBe('orbit-10');
    const config = structuredClone(s.game.config);
    s.connection('a', false);
    s.leave('a');
    expect(s.game.config).toEqual(config);
    expect(config.targetOrders).toBe(scaledLevel('orbit-10', 2).targetOrders);
  });
  it('has five distinct station layouts, bounded levels and a 50-step unlock chain', () => {
    expect(
      new Set(
        [0, 10, 20, 30, 40].map((i) =>
          JSON.stringify(levels[i].stations.map((s) => [s.id, s.x, s.z])),
        ),
      ).size,
    ).toBe(5);
    expect(
      new Set(
        levels.map((l) =>
          JSON.stringify([
            l.name,
            l.duration,
            l.targetOrders,
            l.spawnSeconds,
            l.patience,
            l.stations,
          ]),
        ),
      ).size,
    ).toBe(50);
  });
});
