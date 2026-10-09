import { test, expect } from '@playwright/test';

test('Guest play starts while optional account status is slow', async ({ page }) => {
  await page.route('**/api/account/status', async () => new Promise(() => {}));
  await page.goto('/');
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 12000 });
});
