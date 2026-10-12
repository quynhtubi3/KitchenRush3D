import { expect, it } from 'vitest';
import { blinkAmount, customerAppearance } from '../apps/client/src/game/character-style';

it('keeps customer hair and blink timing deterministic across co-op clients', () => {
  const first = customerAppearance('guest-482');
  expect(customerAppearance('guest-482')).toEqual(first);
  expect(first.variant).toBeGreaterThanOrEqual(0);
  expect(first.variant).toBeLessThan(4);
  expect(first.hair).toMatch(/^#[0-9a-f]{6}$/i);
  expect(first.blinkOffset).toBeGreaterThanOrEqual(0);
  expect(first.blinkOffset).toBeLessThan(4.3);
  expect(
    new Set(Array.from({ length: 300 }, (_, i) => customerAppearance(`guest-${i}`).variant)).size,
  ).toBe(4);
});

it('uses short scheduled blinks only when motion is enabled', () => {
  expect(blinkAmount(0.085, 0, false)).toBeCloseTo(1);
  expect(blinkAmount(0.085, 0, true)).toBe(0);
  expect(blinkAmount(2, 0, false)).toBe(0);
});
