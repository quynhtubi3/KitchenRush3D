import { expect, it } from 'vitest';
import { Game } from '../apps/server/src/simulation/game';
import { chefExpression, faceExpressions, faceUVs } from '../apps/client/src/game/character-face';

it('keeps all eight moods and blink cells disjoint inside the shared atlas', () => {
  const centers = new Set<string>();
  for (const mood of faceExpressions)
    for (const closed of [false, true]) {
      const uv = faceUVs(mood, closed);
      expect(uv).toHaveLength(35 * 2);
      expect(uv.every((n) => Number.isFinite(n) && n > 0 && n < 1)).toBe(true);
      centers.add(`${uv[0]}:${uv[1]}`);
    }
  expect(centers.size).toBe(16);
});
it('selects moods from confirmed nearby gameplay and ignores distant teammate failures', () => {
  const g = new Game({ id: 'little-sun-01' });
  g.addChef('p');
  g.state.phase = 'playing';
  const p = g.state.chefs.p;
  expect(chefExpression(g.state, 'p', 0)).toBe('neutral');
  g.state.event.key = 'invalid';
  expect(chefExpression(g.state, 'p', 0)).toBe('neutral');
  expect(chefExpression(g.state, 'p', 1)).toBe('confused');
  const stove = g.state.stations.find((s) => s.id === 'stove')!;
  p.x = stove.x;
  p.z = stove.z + 1;
  p.action = 'stove';
  stove.phase = 'processing';
  expect(chefExpression(g.state, 'p', 0)).toBe('focused');
  stove.phase = 'burnt';
  expect(chefExpression(g.state, 'p', 0)).toBe('panic');
  stove.phase = 'idle';
  p.action = 'seat';
  expect(chefExpression(g.state, 'p', 1)).toBe('confused');
  g.state.event.key = 'served';
  expect(chefExpression(g.state, 'p', 1)).toBe('proud');
  g.state.remaining = 10;
  expect(chefExpression(g.state, 'p', 0)).toBe('exhausted');
});
