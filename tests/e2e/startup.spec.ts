import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'kr-preferences-v1',
      JSON.stringify({ quality: 'low', reducedMotion: true }),
    ),
  );
});

test('Guest play starts while optional account status is slow', async ({ page }) => {
  await page.route('**/api/account/status', async () => new Promise(() => {}));
  await page.goto('/');
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.hud')).toBeVisible({ timeout: 12000 });
});

for (const mode of ['solo', 'private', 'public'] as const) {
  test(`Home cancels delayed ${mode} entry and closes its late socket without replacing a new session`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reserved = false;
    let oldRoomId = '';
    let oldClosed = false;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('websocket', (socket) => {
      if (oldRoomId && socket.url().includes(`/${oldRoomId}?`))
        socket.on('close', () => {
          oldClosed = true;
        });
    });
    const path =
      mode === 'solo'
        ? 'create/solo'
        : mode === 'private'
          ? 'create/coop_private'
          : 'joinOrCreate/coop_public';
    await page.route(
      `**/matchmake/${path}`,
      async (route) => {
        const response = await route.fetch();
        oldRoomId = (await response.json()).roomId;
        reserved = true;
        await gate;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await page.goto('/');
    if (mode === 'solo') await page.locator('[data-action="play"]').click();
    else {
      await page.locator('[data-action="multiplayer"]').click();
      await page
        .locator(`[data-action="${mode === 'private' ? 'create-private' : 'matchmake'}"]`)
        .click();
    }
    await expect.poll(() => reserved).toBe(true);
    await page.locator('.dialog [data-action="home"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'menu');
    expect(await page.evaluate(() => sessionStorage.getItem('kr-reconnect'))).toBeNull();
    await page.locator('[data-action="play"]').click();
    await expect(page.locator('.hud')).toBeVisible();
    const token = await page.evaluate(() => sessionStorage.getItem('kr-reconnect'));
    release();
    await expect.poll(() => oldClosed).toBe(true);
    expect(await page.evaluate(() => sessionStorage.getItem('kr-reconnect'))).toBe(token);
    await expect(page.locator('.hud')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('Home cancels account preparation before matchmaking and ignores a stale failure', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/api/account/status', async () => new Promise(() => {}));
  page.on('request', (request) => {
    if (request.url().includes('/matchmake/')) requests++;
  });
  await page.goto('/');
  await page.locator('[data-action="play"]').click();
  await page.locator('.dialog [data-action="home"]').click();
  await page.waitForTimeout(2200);
  expect(requests).toBe(0);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/matchmake/create/solo', async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: { error: 'delayed failure' } });
  });
  await page.locator('[data-action="play"]').click();
  await expect.poll(() => requests).toBe(1);
  await page.locator('.dialog [data-action="home"]').click();
  release();
  await page.waitForTimeout(500);
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'menu');
});
