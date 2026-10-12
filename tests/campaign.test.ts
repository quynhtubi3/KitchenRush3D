import { afterAll, describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Game } from '../apps/server/src/simulation/game';
import {
  levels,
  recipes,
  getLevel,
  scaledLevel,
  validateCampaign,
  unlockedLevels,
  recordWin,
  recipeById,
  dishRecipe,
  pickOrderRecipe,
} from '../packages/content/src/campaign';
import { findPath, neighbors } from '../apps/server/src/simulation/pathfinding';
import type { Result } from '../packages/shared/src/types';
const balance: (Result & { startingTeamSize: number })[] = [];
const measurements = new WeakMap<Game, { actions: number; travel: number }>();
const recipeEvidence: { recipe: string; seconds: number; actions: number; travel: number }[] = [];
afterAll(() => {
  if (process.env.CAMPAIGN_REPORT)
    writeFileSync(process.env.CAMPAIGN_REPORT, JSON.stringify(balance, null, 2));
  if (process.env.RECIPE_REPORT)
    writeFileSync(process.env.RECIPE_REPORT, JSON.stringify(recipeEvidence, null, 2));
});

function tick(g: Game, until: () => boolean, limit = 4000) {
  for (let i = 0; !until() && i < limit && g.state.phase === 'playing'; i++) {
    const measure = measurements.get(g);
    const before = measure ? Object.values(g.state.chefs).map((chef) => ({ ...chef })) : [];
    g.tick(0.05);
    if (measure)
      for (const previous of before) {
        const chef = g.state.chefs[previous.id];
        measure.travel += Math.hypot(chef.x - previous.x, chef.z - previous.z);
      }
  }
  if (!until())
    throw new Error(
      `Timed out ${g.content.id} t=${g.state.elapsed.toFixed(1)} served=${g.state.served} ${JSON.stringify(g.state.chefs)}`,
    );
}
function act(g: Game, station: string, chef = 'a') {
  const measure = measurements.get(g);
  if (measure) measure.actions++;
  g.intent(chef, { type: 'interact', station });
  tick(g, () => !g.state.chefs[chef].target, 400);
}
function prepare(g: Game, recipe: ReturnType<typeof recipeById>, kind: string, chef = 'a') {
  const dispenser = g.state.stations.find((s) => s.ingredient === kind);
  if (dispenser) {
    act(g, dispenser.id, chef);
    return;
  }
  const step = recipe.steps.find((s) => s.output === kind);
  if (!step || step.station === 'assembly') throw new Error(`No process for ${recipe.id}:${kind}`);
  prepare(g, recipe, step.inputs[0], chef);
  act(g, step.station, chef);
  for (let n = 0; n < step.taps; n++) act(g, step.station, chef);
  if (!step.taps) tick(g, () => g.station(step.station).phase === 'ready');
  act(g, step.station, chef);
}
function clean(g: Game) {
  const dirty = g.state.stations.find((s) => s.kind === 'seat' && s.item?.kind === 'dirtyPlate');
  if (!dirty) return false;
  act(g, dirty.id);
  act(g, 'sink');
  tick(g, () => g.station('sink').phase === 'ready');
  act(g, 'sink');
  act(g, 'rack');
  return true;
}
function cookOrder(g: Game, recipe: ReturnType<typeof recipeById>, size: number) {
  act(g, 'rack');
  act(g, 'assembly');
  for (let componentIndex = 0; componentIndex < recipe.components.length; componentIndex++) {
    const chef = String.fromCharCode(97 + (componentIndex % size));
    prepare(g, recipe, recipe.components[componentIndex], chef);
    act(g, 'assembly', chef);
  }
  const server = 'a';
  act(g, 'assembly', server);
  expect(g.state.chefs[server].item?.kind).toBe(recipe.steps.at(-1)!.output);
  const waiting = g.state.customers.find(
    (customer) => customer.recipe === recipe.id && customer.state === 'WaitingForFood',
  );
  if (!waiting) throw new Error(`Customer expired while cooking ${recipe.id}`);
  act(g, waiting.seat!, server);
  expect(g.state.chefs[server].item).toBeNull();
}
// This driver only submits normal intents and advances fixed simulation ticks.
// It never writes score, inventory, timers, position, customers or result.
export function playLevel(id: string, size: number) {
  const g = new Game(scaledLevel(id, size));
  for (let i = 0; i < size; i++) g.addChef(String.fromCharCode(97 + i), i);
  while (!g.canWin() && g.state.phase === 'playing') {
    while (clean(g)) {}
    tick(g, () => g.state.customers.some((c) => c.state === 'WaitingForFood'));
    if (!Object.values(g.state.chefs).some((c) => c.item || c.target)) {
      const burnt = g.state.stations.find((s) => s.kind === 'stove' && s.item?.kind === 'burnt');
      if (burnt) act(g, 'trash');
    }
    const customer = g.state.customers.find((c) => c.state === 'WaitingForFood')!;
    const recipe = recipeById(customer.recipe);
    cookOrder(g, recipe, size);
    const all = [
      ...Object.values(g.state.chefs).map((c) => c.item),
      ...g.state.stations.flatMap((s) => [s.item, ...s.stock]),
    ].filter(Boolean);
    expect(new Set(all.map((i) => i!.id)).size).toBe(all.length);
    expect(
      all.filter((i) => i!.kind === 'plate' || i!.kind === 'dirtyPlate' || dishRecipe(i!.kind)),
    ).toHaveLength(g.config.plates);
  }
  g.intent('a', { type: 'finish' });
  expect(g.state.result?.won, `${id} ×${size}`).toBe(true);
  return g.state.result!;
}
describe('campaign content engine', () => {
  it('validates all 50 levels, references and reachable equipment for four spawns', () => {
    expect(validateCampaign).not.toThrow();
    expect(levels).toHaveLength(50);
    expect(recipes).toHaveLength(25);
    expect(getLevel('little-sun-01').recipes).toEqual(['sunshine-burger']);
    expect(getLevel('little-sun-02').recipes).toEqual(['sunshine-burger', 'sunshine-cheeseburger']);
    expect(getLevel('little-sun-03').recipes).toContain('sunshine-chicken-burger');
    expect(getLevel('little-sun-07').recipes).toContain('toasted-burger');
    expect(getLevel('little-sun-07').recipes).toHaveLength(4);
    expect(getLevel('little-sun-10').recipes).toEqual([
      'sunshine-burger',
      'sunshine-cheeseburger',
      'sunshine-chicken-burger',
      'toasted-burger',
      'sunshine-fries',
    ]);
    for (const restaurant of ['little-sun', 'tide', 'olive', 'lantern', 'orbit']) {
      const level = levels.find(
        (entry) => entry.restaurantId === restaurant && entry.number === 10,
      )!;
      const extraSources = level.stations
        .filter((station) => station.id.startsWith('ingredient-'))
        .sort((a, b) => a.x - b.x);
      expect(extraSources.length, `${restaurant} extra recipe ingredients`).toBeGreaterThan(0);
      expect(
        new Set(extraSources.map((station) => station.z)).size,
        `${restaurant} source row`,
      ).toBe(1);
      expect(new Set(extraSources.map((station) => station.x)).size).toBe(extraSources.length);
      for (let index = 1; index < extraSources.length; index++)
        expect(extraSources[index].x - extraSources[index - 1].x).toBeGreaterThanOrEqual(4);
      expect(
        extraSources.every((station) => station.z >= 7),
        `${restaurant} front row`,
      ).toBe(true);
    }
    const menuSizes = [1, 2, 3, 3, 4, 4, 4, 4, 4, 5];
    for (const restaurant of ['little-sun', 'tide', 'olive', 'lantern', 'orbit'])
      expect(
        levels
          .filter((entry) => entry.restaurantId === restaurant)
          .map((entry) => entry.recipes.length),
        restaurant,
      ).toEqual(menuSizes);
    expect(
      pickOrderRecipe(
        getLevel('little-sun-10').recipes,
        getLevel('little-sun-10').recipeWeights,
        'sunshine-burger',
        0,
      ),
    ).not.toBe('sunshine-burger');
    expect(
      pickOrderRecipe(
        getLevel('little-sun-07').recipes,
        getLevel('little-sun-07').recipeWeights,
        undefined,
        0,
        true,
      ),
    ).toBe('toasted-burger');
    for (const l of levels) {
      const g = new Game({ id: l.id });
      for (let slot = 0; slot < 4; slot++)
        for (const station of l.stations)
          expect(
            neighbors(station).some((p) => findPath({ x: 7 + slot, z: 8 }, p, g.blocked) !== null),
            `${l.id}:${station.id}`,
          ).toBe(true);
      expect(l.duration).toBeGreaterThanOrEqual(120);
      expect(l.duration).toBeLessThanOrEqual(360);
    }
  });
  it('keeps both dining seats in every level while furniture is rendered as a shared row', () => {
    for (const level of levels) {
      expect(
        level.stations
          .filter((station) => station.kind === 'seat')
          .map((station) => station.id)
          .sort(),
        level.id,
      ).toEqual(['seat1', 'seat2']);
    }
  });
  it('unlocks only sequential wins, including restaurant boundaries; replay is idempotent', () => {
    let wins: string[] = [];
    expect(unlockedLevels(wins)).toHaveLength(1);
    for (let i = 0; i < 50; i++) {
      const result = { won: true, levelId: levels[i].id } as Result;
      expect(recordWin(wins, { ...result, won: false })).toEqual(wins);
      if (i < 49) expect(recordWin(wins, { ...result, levelId: levels[i + 1].id })).toEqual(wins);
      wins = recordWin(wins, result);
      expect(recordWin(wins, result)).toEqual(wins);
      expect(unlockedLevels(wins)).toHaveLength(Math.min(50, i + 2));
    }
    expect(() => getLevel('fake')).toThrow();
  });
  it('keeps the chosen recipe on a carried partial plate and rejects competing ingredients', () => {
    const g = new Game({ id: 'little-sun-10' });
    g.addChef('a');
    g.addChef('b', 1);
    g.intent('a', { type: 'selectRecipe', recipe: 'sunshine-cheeseburger' });
    g.intent('a', { type: 'selectRecipe', recipe: 'not-in-menu' });
    expect(g.state.chefs.a.preferredRecipe).toBe('sunshine-cheeseburger');
    act(g, 'rack');
    act(g, 'assembly');
    prepare(g, recipeById('sunshine-cheeseburger'), 'bun');
    act(g, 'assembly');
    const plateId = g.station('assembly').item!.id;
    expect(g.state.chefs.a.preferredRecipe).toBeUndefined();
    act(g, 'assembly');
    expect(g.state.chefs.a.item?.assemblyRecipe).toBe('sunshine-cheeseburger');
    act(g, 'assembly');
    g.intent('b', { type: 'selectRecipe', recipe: 'sunshine-chicken-burger' });
    prepare(g, recipeById('sunshine-chicken-burger'), 'friedChicken', 'b');
    act(g, 'assembly', 'b');
    expect(g.state.chefs.b.item?.kind).toBe('friedChicken');
    expect(g.station('assembly').item?.id).toBe(plateId);
    expect(g.station('assembly').item?.parts).toEqual(['bun']);
    expect(g.station('assembly').item?.assemblyRecipe).toBe('sunshine-cheeseburger');
    for (const component of ['cookedMeat', 'choppedLettuce', 'slicedCheese']) {
      prepare(g, recipeById('sunshine-cheeseburger'), component);
      act(g, 'assembly');
    }
    expect(g.station('assembly').item?.kind).toBe('cheeseburger');
  });
  it('uses seeded weighted order selection with variety across an unlocked menu', () => {
    const config = {
      ...getLevel('little-sun-10'),
      spawnSeconds: 0.4,
      queueLimit: 100,
      queuePatience: 500,
      patience: 500,
    };
    const first = new Game(config, 'menu-seed-10');
    const replay = new Game(config, 'menu-seed-10');
    for (let frame = 0; frame < 80; frame++) {
      first.tick(0.25);
      replay.tick(0.25);
    }
    const sequence = first.state.customers.map((customer) => customer.recipe);
    expect(sequence).toEqual(replay.state.customers.map((customer) => customer.recipe));
    expect(new Set(sequence).size).toBeGreaterThanOrEqual(4);
    expect(sequence.every((recipe, index) => index === 0 || recipe !== sequence[index - 1])).toBe(
      true,
    );
  });
  it('gives every unlocked dish a meaningful chance across independent match seeds', () => {
    for (const level of levels.filter((entry) => entry.number === 10)) {
      const counts = new Map(level.recipes.map((id) => [id, 0]));
      for (let seed = 0; seed < 1000; seed++) {
        const game = new Game(level, `distribution-${seed}`);
        const recipe = game.state.customers[0].recipe;
        expect(counts.has(recipe)).toBe(true);
        counts.set(recipe, counts.get(recipe)! + 1);
      }
      for (const [id, count] of counts) {
        expect(count, id).toBeGreaterThan(35);
        expect(count, id).toBeLessThan(500);
      }
    }
  });
  it('cooks and serves every authored recipe using the normal server simulation', () => {
    for (const recipe of recipes) {
      const firstLevel = levels.find((entry) => entry.recipes.includes(recipe.id))!;
      const config = { ...firstLevel, duration: 300, targetOrders: 1, targetScore: 1 };
      let game: Game | undefined;
      for (let seed = 0; seed < 1000; seed++) {
        const candidate = new Game(config, `recipe-${recipe.id}-${seed}`);
        if (candidate.state.customers[0]?.recipe === recipe.id) {
          game = candidate;
          break;
        }
      }
      expect(game, `seed for ${recipe.id}`).toBeDefined();
      game!.addChef('a');
      tick(game!, () =>
        game!.state.customers.some((customer) => customer.state === 'WaitingForFood'),
      );
      measurements.set(game!, { actions: 0, travel: 0 });
      const startedAt = game!.state.elapsed;
      cookOrder(game!, recipe, 1);
      recipeEvidence.push({
        recipe: recipe.id,
        seconds: game!.state.elapsed - startedAt,
        ...measurements.get(game!)!,
      });
      expect(game!.state.served, recipe.id).toBe(1);
      game!.intent('a', { type: 'finish' });
      expect(game!.state.result?.won, recipe.id).toBe(true);
    }
  });
});
describe('50 playable levels × 1/2/3/4 chefs', () => {
  for (const l of levels)
    for (const size of [1, 2, 3, 4])
      it(`${l.id} team ${size} wins using real movement/cooking/serving/washing`, () => {
        balance.push({ ...playLevel(l.id, size), startingTeamSize: size });
      });
});
