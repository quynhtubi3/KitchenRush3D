import { test, expect } from '@playwright/test';
test('Retina backing buffer tracks sharpness, profile and orientation', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.locator('[data-action="play"]').click();
    await expect(page.locator('.hud')).toBeVisible();
    await page.locator('[data-action="pause"]').click();
    await page.addStyleTag({ content: '.veil { visibility: hidden !important; }' });
    for (const [mode, scale] of [
      ['css', 1],
      ['auto', 2],
      ['native', 3],
    ] as const) {
      await page.locator('[data-action="settings"]').click();
      await page.locator('#setting-sharpness').selectOption(mode);
      await page.keyboard.press('Escape');
      await expect
        .poll(
          async () =>
            JSON.parse((await page.locator('canvas').getAttribute('data-resolution-stats')) ?? '{}')
              .effectiveScale,
        )
        .toBeCloseTo(scale, 1);
      await page
        .locator('.veil')
        .evaluate((el) => ((el as HTMLElement).style.visibility = 'hidden'));
      await page.screenshot({ path: `docs/screenshots/pass5/retina-${mode}.png` });
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await expect
      .poll(
        async () =>
          JSON.parse((await page.locator('canvas').getAttribute('data-resolution-stats')) ?? '{}')
            .css[0],
      )
      .toBe(844);
  } finally {
    await context.close();
  }
});
