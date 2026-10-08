import { test, expect, type Page } from '@playwright/test';
async function station(page: Page, id: string, holding?: string) {
  await page.locator(`[data-station="${id}"]`).click();
  if (holding) await expect(page.locator('#hand')).toHaveText(holding);
  else await page.waitForTimeout(1800);
}
async function burger(page: Page) {
  await station(page, 'rack', 'Đĩa');
  await station(page, 'assembly', 'Tay trống');
  await station(page, 'meat', 'Thịt');
  await station(page, 'stove', 'Tay trống');
  await station(page, 'lettuce', 'Rau xà lách');
  await station(page, 'board', 'Tay trống');
  for (let i = 1; i <= 3; i++) {
    await page.locator('[data-station="board"]').click();
    await expect(page.locator('[data-station="board"] small')).toContainText(
      i < 3 ? `${i}/3` : 'Sẵn sàng',
    );
  }
  await station(page, 'board', 'Rau đã cắt');
  await station(page, 'assembly', 'Tay trống');
  await expect(page.locator('[data-station="stove"] small')).toHaveText('Sẵn sàng');
  await station(page, 'stove', 'Thịt chín');
  await station(page, 'assembly', 'Tay trống');
  await station(page, 'bun', 'Bánh mì');
  await station(page, 'assembly', 'Tay trống');
  await station(page, 'assembly', 'Burger Nắng Mai');
}
test('real browser: cook, serve, wash, reuse, win, persist result', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Vào bếp' })).toBeVisible();
  await page.screenshot({ path: 'test-results/menu-desktop.png' });
  await page.getByRole('button', { name: 'Vào bếp' }).click();
  await expect(page.locator('.hud')).toBeVisible();
  await burger(page);
  await station(page, 'seat1', 'Tay trống');
  await expect(page.locator('#orders')).toContainText('1');
  await expect(page.locator('[data-station="seat1"] small')).toHaveText('Cần thu đĩa');
  await station(page, 'seat1', 'Đĩa bẩn');
  await station(page, 'sink', 'Tay trống');
  await expect(page.locator('[data-station="sink"] small')).toHaveText('Sẵn sàng');
  await station(page, 'sink', 'Đĩa');
  await station(page, 'rack', 'Tay trống');
  await burger(page);
  await station(page, 'seat1', 'Tay trống');
  await expect(page.locator('#orders')).toContainText('2');
  await page.screenshot({ path: 'test-results/gameplay-desktop.png' });
  await page.locator('#finish').click();
  await expect(page.locator('.results')).toContainText('Một ca làm rực rỡ');
  await expect(page.locator('.results')).toContainText('Đã lưu kết quả');
  await page.screenshot({ path: 'test-results/result-desktop.png' });
  await page.getByRole('button', { name: 'Về thực đơn' }).click();
  await expect(page.locator('.best')).toBeVisible();
  await expect(page.locator('#campaign-level option[value="little-sun-02"]')).toBeEnabled();
  await expect(page.locator('#campaign-level option[value="little-sun-03"]')).toBeDisabled();
  await page.reload();
  await expect(page.locator('#campaign-level option[value="little-sun-02"]')).toBeEnabled();
  expect(errors).toEqual([]);
});
test('mobile touch, recipe, language, pause and reconnect', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Vào bếp' }).tap();
  await expect(page.locator('.hud')).toBeVisible();
  await page.locator('[data-station="rack"]').tap();
  await expect(page.locator('#hand')).toHaveText('Đĩa');
  await expect
    .poll(async () =>
      page.locator('.station-label').evaluateAll((nodes) =>
        nodes.every((node) => {
          const r = node.getBoundingClientRect();
          return (
            r.left >= 0 &&
            r.right <= window.innerWidth &&
            r.top >= 0 &&
            r.bottom <= window.innerHeight
          );
        }),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: 'test-results/gameplay-mobile.png' });
  await page.locator('.game-tools [data-action="recipe"]').tap();
  await expect(page.locator('.notebook')).toBeVisible();
  await page.getByRole('button', { name: 'Đóng', exact: true }).tap();
  await page.getByRole('button', { name: 'Tạm dừng', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Nghỉ tay một chút' })).toBeVisible();
  const timer = await page.locator('#timer').textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator('#timer')).toHaveText(timer!);
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).tap();
  await page.reload();
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.locator('#hand')).toHaveText('Đĩa');
  await page.getByRole('button', { name: '◎ English' }).tap();
  await expect(page.locator('#hand')).toHaveText('Plate');
  await context.close();
});
