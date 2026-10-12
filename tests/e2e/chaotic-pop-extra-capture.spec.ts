import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { levels } from '../../packages/content/src/campaign';

const captureDir = resolve(
  process.env.CHAOTIC_POP_CAPTURE_DIR ?? 'docs/screenshots/chaotic-pop-after',
);
const wins = levels.map((level) => level.id);

async function prepare(page: import('@playwright/test').Page) {
  await page.addInitScript(
    ({ unlocked }) => {
      localStorage.setItem('kr-campaign-wins', JSON.stringify(unlocked));
      localStorage.setItem(
        'kr-preferences-v1',
        JSON.stringify({ quality: 'standard', reducedMotion: true, showAllStationLabels: true }),
      );
    },
    { unlocked: wins },
  );
  await page.goto('/');
}

test('Chaotic Pop captures menu, mobile landscape, compact portrait and close-up', async ({
  browser,
}) => {
  mkdirSync(captureDir, { recursive: true });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await prepare(desktop);
  await expect(desktop.locator('.menu')).toBeVisible();
  await desktop.screenshot({ path: resolve(captureDir, 'main-menu-1440x900.png') });
  await desktop.locator('[data-action="play"]').click();
  await expect(desktop.locator('.hud')).toBeVisible();
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: resolve(captureDir, 'little-sun-desktop-closeup.png') });
  await desktop.close();

  for (const viewport of [
    { name: 'mobile-landscape', width: 844, height: 390 },
    { name: 'small-portrait', width: 360, height: 640 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      await prepare(page);
      await page.locator('[data-action="play"]').click();
      await expect(page.locator('.hud')).toBeVisible();
      await page.locator('[data-action="camera"]').tap();
      await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(captureDir, `${viewport.name}.png`) });
      if (viewport.name === 'mobile-landscape') {
        await page.locator('[data-action="camera"]').tap();
        await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'chef');
        await page.waitForTimeout(250);
        await page.screenshot({ path: resolve(captureDir, 'mobile-landscape-follow.png') });
      }
    } finally {
      await context.close();
    }
  }
});

test('Chaotic Pop captures a natural server-timed defeat', async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    await prepare(page);
    await page.locator('[data-action="play"]').click();
    await expect(page.locator('.hud')).toBeVisible();
    // No orders or finish intent are sent. The authoritative match clock expires naturally.
    await expect(page.locator('.results')).toBeVisible({ timeout: 210000 });
    await expect(page.locator('.results h2')).toBeVisible();
    await page.screenshot({ path: resolve(captureDir, 'defeat-desktop.png') });
  } finally {
    await context.close();
  }
});

test('Chaotic Pop graphics profiles switch without losing the scene', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  try {
    const page = await context.newPage();
    await page.addInitScript(() =>
      localStorage.setItem(
        'kr-preferences-v1',
        JSON.stringify({ quality: 'low', reducedMotion: true }),
      ),
    );
    await page.goto('/');
    await page.locator('[data-action="play"]').click();
    await expect(page.locator('.hud')).toBeVisible();

    const selectProfile = async (quality: 'low' | 'standard' | 'high') => {
      await page.locator('[data-action="settings"]').click();
      await page.locator('#setting-quality').selectOption(quality);
      await expect(page.locator('body')).toHaveAttribute('data-quality', quality);
      await expect
        .poll(async () => {
          const stats = await page.locator('canvas').getAttribute('data-render-stats');
          return JSON.parse(stats ?? '{}').quality;
        })
        .toBe(quality);
      await page.keyboard.press('Escape');
    };

    await selectProfile('low');
    await selectProfile('standard');
    await selectProfile('high');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(1900, 1060);
    await page.waitForTimeout(500);
    const stats = JSON.parse((await page.locator('canvas').getAttribute('data-render-stats'))!);
    expect(stats.drawCalls).toBeGreaterThan(0);
    expect(stats.triangles).toBeGreaterThan(0);
    await page.screenshot({ path: resolve(captureDir, 'little-sun-desktop-1920x1080-high.png') });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      resolve(captureDir, 'little-sun-desktop-1920x1080-high-stats.json'),
      `${JSON.stringify({ renderer: 'Chromium SwiftShader (not a device benchmark)', ...stats }, null, 2)}\n`,
    );
  } finally {
    await context.close();
  }
});
