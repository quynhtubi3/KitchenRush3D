import { test, expect } from '@playwright/test';
import { getLevel } from '../../packages/content/src/campaign';

test('a touch joystick player moves inside a real two-player room', async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const host = await desktop.newPage(),
      guest = await mobile.newPage();
    await Promise.all([host.goto('/'), guest.goto('/')]);
    await guest.evaluate(() =>
      localStorage.setItem('kr-preferences-v1', JSON.stringify({ touchControls: 'joystick' })),
    );
    await guest.reload();
    await host.locator('[data-action="multiplayer"]').click();
    await host.locator('#team-size').selectOption('2');
    await host.locator('[data-action="create-private"]').click();
    await expect(host.locator('#invite-code')).toBeVisible();
    await guest.locator('[data-action="multiplayer"]').click();
    await guest.locator('#room-code').fill(await host.locator('#invite-code').innerText());
    await guest.locator('[data-action="join-private"]').click();
    await expect(host.locator('.lobby-member')).toHaveCount(2);
    await host.locator('[data-action="ready"]').click();
    await guest.locator('[data-action="ready"]').tap();
    await expect(host.locator('[data-action="start-team"]')).toBeEnabled();
    await host.locator('[data-action="start-team"]').click();
    await expect(guest.locator('#joystick')).toBeVisible();
    const before = await guest.locator('#mobile-controls').getAttribute('data-x');
    const pad = (await guest.locator('#joystick').boundingBox())!;
    const touch = await mobile.newCDPSession(guest);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: pad.x + pad.width / 2 - 38, y: pad.y + pad.height / 2 }],
    });
    await expect(guest.locator('#mobile-controls')).not.toHaveAttribute('data-x', before!);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(host.locator('.teammate')).toHaveCount(2);
    expect(await guest.locator('.hud').isVisible()).toBe(true);
  } finally {
    await desktop.close();
    await mobile.close();
  }
});

for (const landscape of [false, true])
  test(`touch joystick ${landscape ? 'landscape' : 'portrait'} moves, stops, interacts and switches modes`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: landscape ? { width: 844, height: 390 } : { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto('/');
      await page.locator('[data-action="settings"]').click();
      await page.locator('#setting-touchControls').selectOption('joystick');
      await page.locator('[data-preference="showAllStationLabels"]').check();
      await page.getByRole('button', { name: 'Đóng cài đặt' }).click();
      await page.locator('[data-action="play"]').click();
      await expect(page.locator('#joystick')).toBeVisible();
      await expect(page.locator('#timer')).toBeVisible();
      const initial = await page.locator('#mobile-controls').getAttribute('data-x');
      const pad = (await page.locator('#joystick').boundingBox())!;
      const cdp = await context.newCDPSession(page);
      const point = { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: point.x + 38, y: point.y }],
      });
      await expect(page.locator('#mobile-controls')).not.toHaveAttribute('data-x', initial!);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(600);
      const stopped = await page.locator('#mobile-controls').getAttribute('data-x');
      await page.waitForTimeout(500);
      await expect(page.locator('#mobile-controls')).toHaveAttribute('data-x', stopped!);
      expect(
        await page.evaluate(() => {
          const controls = ['#joystick', '#touch-interact'].map((s) =>
            document.querySelector(s)!.getBoundingClientRect(),
          );
          const important = [
            ...Array.from(
              document.querySelectorAll('.station-label,.hud,.orders-list,.game-tools'),
            ),
          ].map((el) => el.getBoundingClientRect());
          return controls.every(
            (a) =>
              a.left >= 0 &&
              a.top >= 0 &&
              a.right <= innerWidth &&
              a.bottom <= innerHeight &&
              important.every(
                (b) =>
                  a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom,
              ),
          );
        }),
      ).toBe(true);
      // The follow crop can hide the distant rack after walking. Use the
      // player-facing overview control before choosing a remote station.
      await page.locator('[data-action="camera"]').tap();
      await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
      await page.locator('[data-station="rack"]').tap();
      await expect(page.locator('#hand')).toHaveText('Đĩa');
      await expect(page.locator('#touch-interact')).toHaveAttribute('data-station-target', 'rack');
      await page.locator('#touch-interact').tap();
      await expect(page.locator('#hand')).toHaveText('Tay trống');
      await page.screenshot({
        path: `test-results/joystick-${landscape ? 'landscape' : 'portrait'}.png`,
      });
      await page.locator('[data-action="settings"]').click();
      const timer = await page.locator('#timer').textContent();
      await expect(page.locator('#timer')).not.toHaveText(timer!);
      await page.locator('#setting-touchControls').selectOption('tap');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(page.locator('#joystick')).not.toBeVisible();
      await expect(page.locator('#touch-interact')).not.toBeVisible();
      await page.locator('[data-station="rack"]').tap();
      await expect(page.locator('#hand')).toHaveText('Đĩa');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

test('mobile real cooking shows ready, near-burn and customer patience warnings', async ({
  browser,
}) => {
  test.setTimeout(240000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() =>
      localStorage.setItem('kr-preferences-v1', JSON.stringify({ showAllStationLabels: true })),
    );
    await page.goto('/');
    await page.locator('[data-action="play"]').click();
    await page.locator('[data-action="camera"]').tap();
    await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
    await page.locator('[data-station="meat"]').tap();
    await expect(page.locator('#hand')).toHaveText('Thịt');
    await page.locator('[data-station="stove"]').tap();
    await expect(page.locator('#hand')).toHaveText('Tay trống');
    await expect(page.locator('[data-station="stove"]')).toHaveAttribute('data-feedback', 'ready', {
      timeout: 12000,
    });
    await expect(page.locator('[data-station="stove"]')).toHaveAttribute(
      'data-feedback',
      'burn-soon',
      { timeout: (getLevel('little-sun-01').burnSeconds + 5) * 1000 },
    );
    await expect(page.locator('[data-station="stove"]')).toContainText('Sắp cháy');
    await expect(page.locator('.ticket.customer-urgent').first()).toContainText('Sắp bỏ đi', {
      timeout: 110000,
    });
    await page.screenshot({ path: 'test-results/mobile-warnings.png' });
  } finally {
    await context.close();
  }
});
