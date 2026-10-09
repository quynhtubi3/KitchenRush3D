import { expect, it } from 'vitest';
import { Game } from '../apps/server/src/simulation/game';
import { Presentation, effectBudget } from '../apps/client/src/game/presentation';

it('pulses real changes once, expires, and does not replay a reconnect snapshot', () => {
  const game = new Game({ id: 'little-sun-01' });
  game.addChef('p');
  const view = new Presentation();
  view.update(game.state);
  expect(view.pulse('chef:p')).toBe(0);
  game.state.elapsed = 0.1;
  game.state.chefs.p.item = { id: 'plate-1', kind: 'plate', parts: [] };
  view.update(game.state);
  expect(view.pulse('chef:p')).toBeCloseTo(1);
  game.state.elapsed = 0.8;
  view.update(game.state);
  expect(view.pulse('chef:p')).toBe(0);
  game.state.elapsed = 5;
  game.state.chefs.p.item = null;
  view.update(game.state);
  expect(view.pulse('chef:p')).toBe(0);
});

it('bounds effects and disables motion effects with Reduced Motion', () => {
  expect(effectBudget(false, false)).toBe(24);
  expect(effectBudget(true, false)).toBe(6);
  expect(effectBudget(false, true)).toBe(0);
  expect(effectBudget(true, true)).toBe(0);
});
