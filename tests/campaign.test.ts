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
} from '../packages/content/src/campaign';
import { findPath, neighbors } from '../apps/server/src/simulation/pathfinding';
import type { Result } from '../packages/shared/src/types';
const balance: (Result & { startingTeamSize: number })[] = [];
afterAll(() => {
  if (process.env.CAMPAIGN_REPORT)
    writeFileSync(process.env.CAMPAIGN_REPORT, JSON.stringify(balance, null, 2));
});

function tick(g: Game, until: () => boolean, limit = 4000) {
  for (let i = 0; !until() && i < limit && g.state.phase === 'playing'; i++) g.tick(0.05);
  if (!until())
    throw new Error(
      `Timed out ${g.content.id} t=${g.state.elapsed.toFixed(1)} served=${g.state.served} ${JSON.stringify(g.state.chefs)}`,
    );
}
function act(g: Game, station: string, chef = 'a') {
  g.intent(chef, { type: 'interact', station });
  tick(g, () => !g.state.chefs[chef].target, 400);
}
function prepare(g: Game, kind: string, chef = 'a') {
  const dispenser = g.state.stations.find((s) => s.ingredient === kind);
  if (dispenser) {
    act(g, dispenser.id, chef);
    return;
  }
  const step = g.content.recipes
    .flatMap((id) => recipeById(id).steps)
    .find((s) => s.output === kind)!;
  prepare(g, step.inputs[0], chef);
  act(g, step.station, chef);
  for (let n = 0; n < step.taps; n++) act(g, step.station, chef);
  tick(g, () => g.station(step.station).phase === 'ready');
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
// This driver only submits normal intents and advances fixed simulation ticks.
// It never writes score, inventory, timers, position, customers or result.
export function playLevel(id: string, size: number) {
  const g = new Game(scaledLevel(id, size));
  for (let i = 0; i < size; i++) g.addChef(String.fromCharCode(97 + i), i);
  while (!g.canWin() && g.state.phase === 'playing') {
    while (clean(g)) {}
    tick(g, () => g.state.customers.some((c) => c.state === 'WaitingForFood'));
    const customer = g.state.customers.find((c) => c.state === 'WaitingForFood')!;
    const recipe = recipeById(customer.recipe),
      hot = recipe.steps[0];
    // Start the unattended branch first, then plate and chop while it cooks.
    prepare(g, hot.inputs[0]);
    act(g, hot.station);
    act(g, 'rack');
    act(g, 'assembly');
    const coldChef = size > 1 ? 'b' : 'a';
    prepare(g, recipe.steps[1].output, coldChef);
    act(g, 'assembly', coldChef);
    tick(g, () => g.station(hot.station).phase === 'ready');
    act(g, hot.station);
    act(g, 'assembly');
    const side = recipe.components.find((c) => c !== hot.output && c !== recipe.steps[1].output)!;
    const sideChef = size > 2 ? 'c' : 'a';
    prepare(g, side, sideChef);
    act(g, 'assembly', sideChef);
    const server = size > 3 ? 'd' : 'a';
    act(g, 'assembly', server);
    expect(g.state.chefs[server].item?.kind).toBe(recipe.steps.at(-1)!.output);
    const waiting = g.state.customers.find(
      (c) => c.recipe === recipe.id && c.state === 'WaitingForFood',
    );
    if (!waiting) throw new Error(`Customer expired in ${id}`);
    act(g, waiting.seat!, server);
    expect(g.state.chefs[server].item).toBeNull();
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
    expect(recipes).toHaveLength(10);
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
});
describe('50 playable levels × 1/2/3/4 chefs', () => {
  for (const l of levels)
    for (const size of [1, 2, 3, 4])
      it(`${l.id} team ${size} wins using real movement/cooking/serving/washing`, () => {
        balance.push({ ...playLevel(l.id, size), startingTeamSize: size });
      });
});
