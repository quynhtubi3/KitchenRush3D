import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'prettier';

const directory = resolve(
  process.env.CHAOTIC_POP_CAPTURE_DIR ?? 'docs/screenshots/chaotic-pop-pass2-after',
);
for (const mode of ['faces', 'food', 'customers'] as const) {
  test(`Pass 2 offline ${mode} asset study uses the runtime art kit`, async ({ page }) => {
    mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/art-study.html?mode=${mode}`);
    await expect(page.locator('canvas')).toHaveAttribute('data-study-ready', mode);
    await page.screenshot({ path: resolve(directory, `${mode}-asset-study.png`) });
    expect(errors).toEqual([]);
  });
}

test('Balanced touch rendering keeps Retina, reacts to settings and suspends when hidden', async ({
  browser,
}) => {
  mkdirSync(directory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.locator('[data-action="play"]').click();
    await expect(page.locator('.hud')).toBeVisible();
    const telemetry = async () =>
      JSON.parse((await page.locator('canvas').getAttribute('data-resolution-stats')) ?? '{}');
    await expect.poll(async () => (await telemetry()).targetFps).toBe(30);
    const attributes = await page
      .locator('canvas')
      .evaluate((element) =>
        (element as HTMLCanvasElement).getContext('webgl2')?.getContextAttributes(),
      );
    expect(attributes?.preserveDrawingBuffer).toBe(false);
    expect(attributes?.stencil).toBe(false);
    expect((await telemetry()).effectiveScale).toBeCloseTo(2, 1);
    expect((await telemetry()).shadowMapSize).toBe(512);
    expect((await telemetry()).shadowMode).toBe('poisson');
    await expect
      .poll(
        async () =>
          JSON.parse((await page.locator('canvas').getAttribute('data-render-stats')) ?? '{}')
            .drawCallsMean,
      )
      .toBeGreaterThan(0);
    // The first playing telemetry can precede the first character pose in that frame.
    await expect
      .poll(async () =>
        (await telemetry()).faces.some((mood: string) => mood.startsWith('neutral:')),
      )
      .toBe(true);
    await page.screenshot({ path: resolve(directory, 'mobile-retina-balanced.png') });
    writeFileSync(
      resolve(directory, 'mobile-retina-balanced-telemetry.json'),
      await format(JSON.stringify(await telemetry()), { parser: 'json' }),
    );
    await page.locator('[data-action="settings"]').click();
    await page.locator('#setting-quality').selectOption('high');
    await expect.poll(async () => (await telemetry()).targetFps).toBe(60);
    expect((await telemetry()).effectiveScale).toBeCloseTo(3, 1);
    await page.locator('#setting-quality').selectOption('low');
    await expect.poll(async () => (await telemetry()).targetFps).toBe(24);
    await page.locator('[data-preference="reducedMotion"]').check();
    await expect(page.locator('canvas')).toHaveAttribute('data-active-effects', '0');
    await page.keyboard.press('Escape');
    // Exercise visibility lifecycle wiring deterministically. This is not an iOS background test.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const frozen = await page.locator('canvas').getAttribute('data-resolution-stats');
    await page.waitForTimeout(1300);
    expect(await page.locator('canvas').getAttribute('data-resolution-stats')).toBe(frozen);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect
      .poll(async () => (await telemetry()).renderedFrames)
      .toBeGreaterThan(JSON.parse(frozen!).renderedFrames);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(async () => (await telemetry()).css[0]).toBe(844);
  } finally {
    await context.close();
  }
});
