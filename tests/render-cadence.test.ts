import { expect, it } from 'vitest';
import {
  RenderCadence,
  ShadowCadence,
  renderFrameRate,
} from '../apps/client/src/game/render-cadence';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';

it('paces 60/120 Hz displays at 30 fps without changing resolution or simulation', () => {
  for (const hz of [60, 120]) {
    const cadence = new RenderCadence();
    const frames: number[] = [];
    for (let tick = 0; tick < hz * 10; tick++) {
      const dt = cadence.step(5000 + (tick * 1000) / hz, 30);
      if (dt !== null) frames.push(dt);
    }
    expect(frames.length).toBe(300);
    expect(frames.slice(1).every((dt) => Math.abs(dt - 1000 / 30) < 0.01)).toBe(true);
  }
});
it('discards background time and resumes without a huge animation jump or catch-up burst', () => {
  const cadence = new RenderCadence();
  cadence.step(0, 30);
  expect(cadence.step(300000, 30, true)).toBeNull();
  expect(cadence.step(400000, 30)).toBeCloseTo(1000 / 30);
  expect(cadence.step(400001, 30)).toBeNull();
  expect(cadence.step(410000, 30)).toBe(10000);
  expect(cadence.step(410001, 30)).toBeNull();
});
it('keeps mobile Balanced sustainable, High opt-in and menus at a lower rate', () => {
  expect(renderFrameRate(true, 'standard', true)).toBe(30);
  expect(renderFrameRate(true, 'low', true)).toBe(24);
  expect(renderFrameRate(true, 'high', true)).toBe(60);
  expect(renderFrameRate(false, 'standard', true)).toBe(60);
  expect(renderFrameRate(true, 'high', false)).toBe(15);
});

it('refreshes Babylon shadow targets at 10 Hz instead of resetting them on every frame', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const map = new RenderTargetTexture('shadow-cadence-test', 128, scene);
  const cadence = new ShadowCadence();
  try {
    let renders = 0;
    for (let tick = 0; tick < 120; tick++) {
      cadence.update(map, (tick * 1000) / 60, true);
      if (map._shouldRender()) renders++;
    }
    expect(renders).toBeGreaterThanOrEqual(18);
    expect(renders).toBeLessThanOrEqual(20);
    for (let tick = 0; tick < 10; tick++) {
      cadence.update(map, 3000 + (tick * 1000) / 60, false);
      expect(map._shouldRender()).toBe(true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
