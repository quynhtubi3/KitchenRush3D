import { test, expect } from '@playwright/test';

for (const mobile of [false, true]) {
  test(`Guest settings: ${mobile ? 'mobile' : 'desktop'} controls persist and do not pause play`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await expect(page.locator('.guest-badge')).toHaveText('Khách');
      await expect(page.locator('[data-action="account"]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const allStationLabels = dialog.locator('[data-preference="showAllStationLabels"]');
      await allStationLabels.check();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              JSON.parse(localStorage.getItem('kr-preferences-v1') ?? '{}').showAllStationLabels,
          ),
        )
        .toBe(true);
      await allStationLabels.uncheck();
      await dialog.getByLabel('Tắt âm thanh').uncheck();
      await dialog.locator('#setting-masterVolume').press('End');
      await expect(dialog.locator('output[for="setting-masterVolume"]')).toHaveText('100%');
      await dialog.locator('#setting-musicVolume').press('Home');
      await dialog.getByLabel('Chất lượng đồ họa').selectOption('low');
      await dialog.getByLabel('Giảm chuyển động').check();
      await dialog.getByRole('button', { name: 'Nghe thử hiệu ứng' }).click();
      await expect(page.locator('body')).toHaveAttribute('data-quality', 'low');
      await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
      expect(
        await dialog.evaluate((node) => {
          const r = node.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
        }),
      ).toBe(true);
      await dialog.getByRole('button', { name: 'Đóng cài đặt' }).click();
      await page.reload();
      await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
      await expect(dialog.getByLabel('Tắt âm thanh')).not.toBeChecked();
      await expect(dialog.locator('#setting-masterVolume')).toHaveValue('100');
      await expect(dialog.locator('#setting-musicVolume')).toHaveValue('0');
      await expect(dialog.getByLabel('Giảm chuyển động')).toBeChecked();
      await dialog.getByRole('button', { name: 'Đóng cài đặt' }).click();
      await page.locator('[data-action="play"]').click();
      await expect(page.locator('.hud')).toBeVisible();
      await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
      const timer = await page.locator('#timer').textContent();
      await expect(page.locator('#timer')).not.toHaveText(timer!);
      await dialog.getByLabel('Chất lượng đồ họa').selectOption('standard');
      await dialog.locator('[data-preference="showAllStationLabels"]').check();
      await expect(page.locator('body')).toHaveAttribute('data-quality', 'standard');
      await dialog.getByRole('button', { name: 'Đóng cài đặt' }).click();
      if (mobile) await page.locator('[data-action="camera"]').click();
      await page.locator('[data-station="rack"]').click();
      await expect(page.locator('#hand')).toHaveText('Đĩa');
      await page.screenshot({ path: `test-results/settings-${mobile ? 'mobile' : 'desktop'}.png` });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
