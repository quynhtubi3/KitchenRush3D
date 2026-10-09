import { test, expect } from '@playwright/test';

test('mobile cooking effects use bounded pools and stop for Reduced Motion', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    recordVideo: { dir: 'test-results/pass4-video', size: { width: 390, height: 844 } },
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() =>
      localStorage.setItem(
        'kr-preferences-v1',
        JSON.stringify({ quality: 'low', reducedMotion: false, showAllStationLabels: true }),
      ),
    );
    await page.goto('/');
    await page.locator('[data-action="play"]').click();
    await expect(page.locator('.hud')).toBeVisible();
    await page.locator('[data-action="camera"]').tap();
    await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
    await page.locator('[data-station="meat"]').tap();
    await expect(page.locator('#hand')).toHaveText('Thịt');
    await page.locator('[data-station="stove"]').tap();
    await expect(page.locator('#hand')).toHaveText('Tay trống');
    await expect
      .poll(async () => Number(await page.locator('canvas').getAttribute('data-active-effects')))
      .toBeGreaterThan(0);
    expect(
      Number(await page.locator('canvas').getAttribute('data-active-effects')),
    ).toBeLessThanOrEqual(24);
    for (let frame = 0; frame < 3; frame++) {
      await page.screenshot({ path: `docs/screenshots/pass4-after/cooking-frame-${frame}.png` });
      await page.waitForTimeout(150);
    }
    await page.locator('[data-action="settings"]').click();
    await page.getByRole('dialog').getByLabel('Giảm chuyển động').check();
    await expect(page.locator('canvas')).toHaveAttribute('data-active-effects', '0');
    await page.getByRole('dialog').getByLabel('Chất lượng đồ họa').selectOption('low');
    await expect(page.locator('canvas')).toHaveAttribute('data-active-effects', '0');
  } finally {
    await context.close();
  }
});
