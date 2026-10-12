import { expect, it } from 'vitest';
import { levels, restaurants } from '../packages/content/src/campaign';
import {
  materialArchetypes,
  restaurantLighting,
  surfaceFamily,
  visualGroundY,
} from '../apps/client/src/game/world-art';
import { materialFinish } from '../apps/client/src/game/geometry-budget';

it('keeps food and fabric dielectric while ceramic, wood and metal have distinct cached finishes', () => {
  expect(surfaceFamily('cheddar slice', true)).toBe('food');
  expect(surfaceFamily('hand-thrown ceramic plate', true)).toBe('ceramic');
  expect(surfaceFamily('apron waist panel')).toBe('fabric');
  expect(surfaceFamily('thick chopping board grip')).toBe('wood');
  expect(surfaceFamily('arched chrome faucet')).toBe('metal');
  expect(surfaceFamily('soft round face')).toBe('skin');
  for (const family of ['food', 'fabric', 'wood', 'ceramic'] as const)
    expect(materialArchetypes[family].metallic).toBe(0);
  const finishes = ['food', 'fabric', 'ceramic', 'metal'].map((family) => {
    const f = materialArchetypes[family as keyof typeof materialArchetypes];
    return materialFinish(f.roughness, f.metallic);
  });
  expect(new Set(finishes.map((finish) => JSON.stringify(finish))).size).toBe(4);
});

it('gives all five worlds restrained lighting without altering campaign data', () => {
  const baseline = JSON.stringify(levels);
  const signatures = new Set();
  for (const restaurant of restaurants) {
    const lighting = restaurantLighting(restaurant.id);
    signatures.add(JSON.stringify(lighting));
    expect(lighting.fill).toBeGreaterThanOrEqual(0.6);
    expect(lighting.key).toBeLessThan(1.3);
    expect(lighting.shadow).toBeGreaterThanOrEqual(0.3);
    expect(lighting.shadow).toBeLessThan(0.5);
  }
  expect(signatures.size).toBe(5);
  expect(visualGroundY).toBe(0);
  expect(JSON.stringify(levels)).toBe(baseline);
});
