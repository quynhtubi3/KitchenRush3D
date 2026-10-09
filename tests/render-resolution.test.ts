import { expect, it } from 'vitest';
import { renderResolution } from '../apps/client/src/game/render-resolution';
it('uses reciprocal hardware scaling for Retina instead of half CSS pixels', () => {
  expect(renderResolution(390, 530, 3, 'standard')).toEqual({
    scale: 2,
    hardwareScalingLevel: 0.5,
    width: 780,
    height: 1060,
  });
  expect(renderResolution(390, 530, 3, 'low').scale).toBe(1.5);
  expect(renderResolution(390, 530, 3, 'high').scale).toBe(3);
});
it('bounds pixel cost, supports explicit CSS comparison and orientation', () => {
  expect(renderResolution(844, 296, 3, 'standard').width).toBe(1688);
  expect(renderResolution(390, 530, 3, 'high', 'css').scale).toBe(1);
  const huge = renderResolution(2000, 1000, 3, 'high');
  expect(huge.width * huge.height).toBeLessThanOrEqual(6_000_000);
  expect(renderResolution(390, 530, NaN, 'standard').scale).toBe(1);
});
