import { describe, expect, it } from 'vitest';
import { Game } from '../apps/server/src/simulation/game';
import { key, neighbors } from '../packages/shared/src/pathfinding';
import { recipeById } from '../packages/content/src/campaign';
import type { Item, ItemKind } from '../packages/shared/src/types';

function serveBurgerWithDifferentRoles() {
  const game = new Game({ id: 'little-sun-01' }, 'crew-relay-spec');
  game.addChef('prep', 0);
  game.addChef('cook', 1);
  const seat = game.state.stations.find((station) => station.kind === 'seat')!;
  game.state.customers = [
    {
      id: 'crew-order',
      seat: seat.id,
      state: 'WaitingForFood',
      patience: 100,
      maxPatience: 100,
      timer: 0,
      recipe: 'sunshine-burger',
    },
  ];
  const assembly = game.state.stations.find((station) => station.kind === 'assembly')!;
  assembly.item = { id: 'team-plate', kind: 'plate', parts: [] };

  const assemble = (chefId: string, kind: ItemKind) => {
    const chef = game.state.chefs[chefId]!;
    const spot = neighbors(assembly).find((point) => !game.blocked.has(key(point)))!;
    chef.x = spot.x;
    chef.z = spot.z;
    chef.item = { id: `${chefId}-${kind}`, kind, parts: [] };
    game.intent(chefId, { type: 'interact', station: assembly.id });
    expect(chef.item).toBeNull();
  };

  assemble('prep', 'bun');
  assemble('cook', 'cookedMeat');
  assemble('prep', 'choppedLettuce');
  const completed = assembly.item!;
  expect(completed.kind).toBe(recipeById('sunshine-burger').steps.at(-1)!.output);
  expect(completed.assemblyChefs).toEqual(['prep', 'cook']);

  const server = game.state.chefs.cook!;
  const standingSpot = neighbors(seat).find((point) => !game.blocked.has(key(point)))!;
  server.x = standingSpot.x;
  server.z = standingSpot.z;
  server.item = completed;
  assembly.item = null;
  game.intent(server.id, { type: 'interact', station: seat.id });
  return game;
}

describe('crew relay', () => {
  it('rewards a teammate handoff after different chefs contribute to the same dish', () => {
    const game = serveBurgerWithDifferentRoles();

    expect(game.state.served).toBe(1);
    expect(game.state.event.key).toBe('teamRelay');
    expect(game.state.score).toBeGreaterThan(150);
  });

  it('does not add co-op relay points to a solo dish', () => {
    const game = new Game({ id: 'little-sun-01' }, 'solo-relay-spec');
    game.addChef('solo');
    const recipe = recipeById('sunshine-burger');
    const seat = game.state.stations.find((station) => station.kind === 'seat')!;
    game.state.customers = [
      {
        id: 'solo-order',
        seat: seat.id,
        state: 'WaitingForFood',
        patience: 100,
        maxPatience: 100,
        timer: 0,
        recipe: recipe.id,
      },
    ];
    const chef = game.state.chefs.solo!;
    const spot = neighbors(seat).find((point) => !game.blocked.has(key(point)))!;
    chef.x = spot.x;
    chef.z = spot.z;
    chef.item = {
      id: 'solo-burger',
      kind: recipe.steps.at(-1)!.output,
      parts: recipe.components,
      assemblyChefs: ['solo'],
    } satisfies Item;
    game.intent(chef.id, { type: 'interact', station: seat.id });

    expect(game.state.served).toBe(1);
    expect(game.state.event.key).toBe('served');
    expect(game.state.score).toBeLessThanOrEqual(150);
  });
});
