import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type Room } from '../../apps/server/tests/network-client';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 1000 },
]) {
  test(`Pass 6 guidance and confirmed tap ${viewport.width}x${viewport.height}`, async ({
    browser,
  }) => {
    const mobile = viewport.width !== 1440;
    const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() =>
        localStorage.setItem(
          'kr-preferences-v1',
          JSON.stringify({ quality: 'low', touchControls: 'tap' }),
        ),
      );
      await page.goto('/');
      await page.locator('[data-action="play"]').click();
      await expect(page.locator('#guidance')).toContainText('Đĩa sạch');
      if (viewport.height > viewport.width) {
        await page.locator('[data-action="dismiss-rotation"]').click();
        await expect(page.locator('.rotation-hint')).toHaveCount(0);
      }
      await page.locator('[data-action="camera"]').click();
      await page.locator('[data-station="rack"]').click();
      await expect(page.locator('#hand')).toHaveText('Đĩa');
      await expect(page.locator('#guidance')).toContainText('Bày món');
      await page.locator('[data-station="assembly"]').click();
      await expect(page.locator('#hand')).toHaveText('Tay trống');
      await expect(page.locator('.ticket[aria-pressed="true"]')).toHaveCount(1);
      if (mobile) await page.locator('[data-action="camera"]').click();
      await page.screenshot({
        path: `docs/screenshots/pass6/guidance-${viewport.width}x${viewport.height}.png`,
      });
      await page.locator('[data-action="settings"]').click();
      await page.locator('[data-preference="guidance"]').uncheck();
      await page.locator('[data-setting-action="close"]').click();
      await expect(page.locator('#guidance')).toBeHidden();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('four network clients share a kitchen and mobile roster', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const peers: Room[] = [];
  try {
    const page = await context.newPage();
    await page.addInitScript(() =>
      localStorage.setItem(
        'kr-preferences-v1',
        JSON.stringify({ quality: 'low', touchControls: 'tap' }),
      ),
    );
    await page.goto('/');
    await page.locator('[data-action="multiplayer"]').click();
    await page.locator('#team-size').selectOption('4');
    await page.locator('[data-action="create-private"]').click();
    const code = await page.locator('#invite-code').innerText();
    const endpoint =
      process.env.E2E_PRODUCTION === 'true' || process.env.E2E_BASE_URL
        ? baseURL!
        : 'http://127.0.0.1:2567';
    for (let i = 0; i < 3; i++) {
      const peer = await new Client(endpoint).joinById(code);
      peer.onMessage('notice', () => {});
      peers.push(peer);
    }
    await expect(page.locator('.lobby-member')).toHaveCount(4);
    for (const peer of peers) peer.send('intent', { type: 'ready', ready: true });
    await expect
      .poll(
        async () =>
          (await page.locator('.lobby-member b').allTextContents()).filter(
            (text) => text === 'Sẵn sàng',
          ).length,
      )
      .toBe(3);
    const lobbyPanel = page.locator('.lobby-panel');
    await lobbyPanel.evaluate((element) => (element.scrollTop = element.scrollHeight));
    await expect.poll(() => lobbyPanel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.locator('[data-action="ready"]').click();
    const host = page.locator('.lobby-member').filter({ hasText: '(Bạn)' });
    await expect(host.locator('b')).toHaveText('Sẵn sàng');
    await expect(page.locator('[data-action="start-team"]')).toBeEnabled();
    await page.locator('[data-action="start-team"]').click();
    await expect(page.locator('.teammate')).toHaveCount(4);
    await expect(page.locator('#overlay .veil')).toHaveCount(0, { timeout: 10000 });
    if (process.env.CHAOTIC_POP_CAPTURE_DIR) {
      mkdirSync(process.env.CHAOTIC_POP_CAPTURE_DIR, { recursive: true });
      await page.screenshot({
        path: resolve(process.env.CHAOTIC_POP_CAPTURE_DIR, 'four-player-landscape.png'),
      });
    } else await page.screenshot({ path: 'docs/screenshots/pass6/four-player-landscape.png' });
    for (const peer of peers) peer.send('intent', { type: 'interact', station: 'rack' });
    await expect
      .poll(() => {
        const state = JSON.parse(peers[0].state.snapshot);
        return Object.values(state.chefs).filter((chef: any) => chef.item?.kind === 'plate').length;
      })
      .toBe(3);
    await expect(page.locator('.team-roster')).toContainText('Đĩa');
  } finally {
    for (const peer of peers) {
      peer.reconnection.enabled = false;
      await peer.leave();
    }
    await context.close();
  }
});
