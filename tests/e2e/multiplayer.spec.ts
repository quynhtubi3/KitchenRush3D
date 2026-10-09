import { test, expect, type Page } from '@playwright/test';
async function station(page: Page, id: string, holding: string) {
  await page.locator(`[data-station="${id}"]`).click();
  await expect(page.locator('#hand')).toHaveText(holding);
}
async function greens(page: Page) {
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
}
test('two real browsers coordinate one dish, washing and social signals in the same match', async ({
  browser,
}) => {
  test.setTimeout(360000);
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
    guestContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await hostContext.newPage(),
    b = await guestContext.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(e.message));
  try {
    await Promise.all([a.goto('/'), b.goto('/')]);
    await a.locator('[data-action="multiplayer"]').click();
    await a.locator('#team-size').selectOption('2');
    await a.getByRole('button', { name: 'Tạo phòng riêng', exact: true }).click();
    await expect(a.locator('.room-code strong')).toBeVisible({ timeout: 20000 });
    const code = await a.locator('.room-code strong').innerText();
    await b.locator('[data-action="multiplayer"]').click();
    await b.locator('#room-code').fill(code);
    await b.getByRole('button', { name: 'Vào phòng', exact: true }).click();
    await expect(a.locator('.lobby-member')).toHaveCount(2);
    await expect(b.locator('[data-action="start-team"]')).toBeDisabled();
    await a.locator('[data-action="ready"]').click();
    await b.locator('[data-action="ready"]').click();
    await expect(a.locator('[data-action="start-team"]')).toBeEnabled();
    await a.screenshot({ path: 'test-results/multiplayer-lobby.png' });
    await a.locator('[data-action="start-team"]').click();
    await expect(a.locator('.hud')).toBeVisible();
    await expect(b.locator('.hud')).toBeVisible();
    // Keep projected station controls stationary during this coordination test.
    // Follow/picking behavior is covered by the dedicated camera and touch tests.
    await Promise.all([
      a.locator('[data-action="camera"]').click(),
      b.locator('[data-action="camera"]').click(),
    ]);
    await expect(a.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
    await expect(b.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
    await expect(a.locator('.teammate')).toHaveCount(2);
    await expect(b.locator('.teammate')).toHaveCount(2);
    await a.locator('[data-action="settings"]').click();
    await a.getByRole('dialog').getByLabel('Giảm chuyển động').check();
    const runningTimer = await b.locator('#timer').textContent();
    await expect(b.locator('#timer')).not.toHaveText(runningTimer!);
    await expect(b.locator('body')).toHaveAttribute('data-reduced-motion', 'false');
    await a.getByRole('button', { name: 'Đóng cài đặt' }).click();
    await a.locator('[data-action="toggle-comms"]').click();
    await a.locator('[data-chat="onGrill"]').click();
    await expect(b.locator('[data-signal="quickChat"]')).toContainText('Mình lo bếp nướng');
    await a.locator('[data-action="toggle-comms"]').click();
    await b.locator('[data-action="ping-mode"]').click();
    await b.locator('[data-station="sink"]').click();
    await expect(a.locator('[data-station="sink"]')).toHaveClass(/station-ping/);
    for (let dish = 0; dish < 1; dish++) {
      await station(a, 'rack', 'Đĩa');
      await station(a, 'assembly', 'Tay trống');
      await Promise.all([
        (async () => {
          await station(a, 'meat', 'Thịt');
          await station(a, 'stove', 'Tay trống');
        })(),
        greens(b),
      ]);
      await expect(a.locator('[data-station="stove"] small')).toContainText('Sẵn sàng');
      await station(a, 'stove', 'Thịt chín');
      await station(a, 'assembly', 'Tay trống');
      await station(a, 'bun', 'Bánh mì');
      await station(a, 'assembly', 'Tay trống');
      await station(b, 'assembly', 'Burger Nắng Mai');
      const waiting = b
        .locator('.station-label')
        .filter({ has: b.locator('small', { hasText: 'Đang đợi burger' }) })
        .first();
      await expect(waiting).toBeVisible();
      const seat = await waiting.getAttribute('data-station');
      await station(b, seat!, 'Tay trống');
      await expect(a.locator('#orders')).toContainText(String(dish + 1));
      await expect(b.locator('#score')).toHaveText(await a.locator('#score').innerText());
      if (dish === 0) {
        await expect(b.locator(`[data-station="${seat}"] small`)).toHaveText('Cần thu đĩa');
        await station(b, seat!, 'Đĩa bẩn');
        await b.context().setOffline(true);
        await expect(b.locator('#overlay .dialog h2')).toContainText('Mất kết nối', {
          timeout: 10000,
        });
        await b.context().setOffline(false);
        await expect(b.locator('#hand')).toHaveText('Đĩa bẩn', { timeout: 30000 });
        await station(b, 'sink', 'Tay trống');
        await expect(b.locator('[data-station="sink"] small')).toHaveText('Sẵn sàng');
        await station(b, 'sink', 'Đĩa');
        await station(b, 'rack', 'Tay trống');
        await b.locator('[data-action="toggle-comms"]').click();
        await b.locator('[data-emote="cheer"]').click();
        await expect(a.locator('[data-signal="emote"]')).toContainText('Tuyệt vời');
        await b.locator('[data-action="toggle-comms"]').click();
      }
    }
    await a.screenshot({ path: 'test-results/multiplayer-gameplay.png' });
    await expect(a.locator('#orders')).toContainText('1');
    await expect(b.locator('#orders')).toHaveText(await a.locator('#orders').innerText());
    await expect(b.locator('#score')).toHaveText(await a.locator('#score').innerText());
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
