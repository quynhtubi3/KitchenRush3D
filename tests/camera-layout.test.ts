import { describe, expect, it } from 'vitest';
import { cameraFrame, cameraProfile, cameraTarget } from '../apps/client/src/game/camera-layout';

describe('responsive orthographic camera framing', () => {
  it.each([
    [1920, 1080, false, 'desktop-overview'],
    [1920, 1080, true, 'desktop-overview'],
    [1024, 768, true, 'desktop-overview'],
    [1280, 600, true, 'mobile-landscape'],
    [390, 844, true, 'mobile-portrait'],
    [844, 390, true, 'mobile-landscape'],
    [360, 640, true, 'mobile-portrait'],
    [768, 1024, true, 'tablet-portrait'],
  ] as const)('selects an intentional profile for %ix%i', (width, height, touch, expected) => {
    expect(cameraProfile(width, height, touch)).toBe(expected);
    const frame = cameraFrame(width, height, expected);
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.height).toBeGreaterThan(0);
    expect(frame.defaultZoom).toBeGreaterThanOrEqual(1);
    expect(frame.width / frame.height).toBeCloseTo(width / height, 3);
  });

  it('keeps the chef target bounded and uses a closer player focus on touch layouts', () => {
    const chef = { x: 14, z: 9 } as const;
    const desktop = cameraFrame(1920, 1080, 'desktop-overview');
    const portrait = cameraFrame(390, 500, 'mobile-portrait');
    const desktopTarget = cameraTarget(chef, desktop);
    const portraitTarget = cameraTarget(chef, portrait);
    expect(Math.abs(desktopTarget.x)).toBeLessThanOrEqual(desktop.followX);
    expect(desktopTarget.z).toBe(-desktop.followZ);
    expect(Math.abs(portraitTarget.z)).toBeLessThanOrEqual(portrait.followZ);
    expect(portraitTarget.x).toBeGreaterThan(desktopTarget.x);
    expect(portraitTarget.z).toBeGreaterThan(desktopTarget.z);
  });

  it('frames a larger kitchen crop in landscape and reserves bounded tablet follow', () => {
    const portrait = cameraFrame(390, 520, 'mobile-portrait');
    const landscape = cameraFrame(844, 312, 'mobile-landscape');
    const portraitPixelsPerUnit = 390 / portrait.width;
    const landscapePixelsPerUnit = 844 / landscape.width;
    expect(landscapePixelsPerUnit).toBeGreaterThan(portraitPixelsPerUnit * 1.03);
    expect(portrait.followX).toBeGreaterThan(0);
    expect(landscape.followX).toBeLessThan(3);
    expect(landscape.height).toBeGreaterThan(11.4);
    expect(portrait.defaultZoom).toBeGreaterThan(landscape.defaultZoom);
  });
});
