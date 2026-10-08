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
test('two real browsers cooperate, wash, chat, ping and unanimously finish the same match', async ({
  browser,
}) => {
  test.setTimeout(240000);
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
    await expect(a.locator('#invite-code')).toBeVisible();
    const code = await a.locator('#invite-code').innerText();
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
    await expect(a.locator('.teammate')).toHaveCount(2);
    await expect(b.locator('.teammate')).toHaveCount(2);
    await a.locator('[data-action="toggle-comms"]').click();
    await a.locator('[data-chat="onGrill"]').click();
    await expect(b.locator('[data-signal="quickChat"]')).toContainText('Mình lo bếp nướng');
    await a.locator('[data-action="toggle-comms"]').click();
    await b.locator('[data-action="ping-mode"]').click();
    await b.locator('[data-station="sink"]').click();
    await expect(a.locator('[data-station="sink"]')).toHaveClass(/station-ping/);
    for (let dish = 0; dish < 3; dish++) {
      await station(a, 'rack', 'Đĩa');
      await station(a, 'assembly', 'Tay trống');
      await Promise.all([
        (async () => {
          await station(a, 'meat', 'Thịt');
          await station(a, 'stove', 'Tay trống');
        })(),
        greens(b),
      ]);
      await expect(a.locator('[data-station="stove"] small')).toHaveText('Sẵn sàng');
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
        await b.reload();
        await expect(b.locator('#hand')).toHaveText('Đĩa bẩn');
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
    await a.locator('#finish').click();
    await expect(b.locator('.vote-status')).toContainText('1/2');
    await expect(a.locator('.results')).toHaveCount(0);
    await b.locator('#finish').click();
    await expect(a.locator('.results')).toContainText('Một ca làm rực rỡ');
    await expect(b.locator('.results')).toContainText('Một ca làm rực rỡ');
    await expect(a.locator('.result-grid strong')).toHaveText(
      await b.locator('.result-grid strong').allTextContents(),
    );
    await a.screenshot({ path: 'test-results/multiplayer-result.png' });
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
