import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format } from 'prettier';
import { levels, restaurants } from '../../packages/content/src/campaign';

const directory = resolve(
  process.env.PASS3_CAPTURE_DIR ?? 'docs/screenshots/chaotic-pop-pass3-after',
);

for (const restaurant of restaurants) {
  test(`Pass 3 ${restaurant.id}: desktop, portrait and landscape world review`, async ({
    browser,
  }) => {
    test.setTimeout(180000);
    mkdirSync(directory, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(
        (wins) => {
          localStorage.setItem('kr-campaign-wins', JSON.stringify(wins));
          localStorage.setItem(
            'kr-preferences-v1',
            JSON.stringify({
              quality: 'standard',
              reducedMotion: true,
              showAllStationLabels: true,
            }),
          );
        },
        levels.map((level) => level.id),
      );
      await page.goto('/');
      const level = levels.find((candidate) => candidate.restaurantId === restaurant.id)!;
      await page.locator('#campaign-level').selectOption(level.id);
      await page.locator('[data-action="play"]').click();
      await expect(page.locator('.hud')).toBeVisible();
      await expect(page.locator('canvas')).toHaveAttribute('data-render-stats', /drawCalls/);
      if (process.env.PASS3_VERIFY === 'true') {
        await expect
          .poll(async () => {
            const info = JSON.parse(
              (await page.locator('canvas').getAttribute('data-resolution-stats')) ?? '{}',
            );
            return info.characterSlots?.[0];
          })
          .toEqual(['hat', 'hair', 'apron']);
        await expect
          .poll(async () => {
            const info = JSON.parse(
              (await page.locator('canvas').getAttribute('data-resolution-stats')) ?? '{}',
            );
            return info.characterBindingsValid;
          })
          .toBe(true);
      }
      await page.locator('[data-action="camera"]').click();
      await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
      for (const viewport of [
        { name: 'desktop-1920', width: 1920, height: 1080 },
        { name: 'portrait', width: 390, height: 844 },
        { name: 'landscape', width: 844, height: 390 },
      ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect
          .poll(async () => {
            const stats = JSON.parse(
              (await page.locator('canvas').getAttribute('data-resolution-stats')) ?? '{}',
            );
            return stats.css?.[0];
          })
          .toBe(viewport.width);
        await page.waitForTimeout(400);
        await page.screenshot({
          path: resolve(directory, `${restaurant.id}-${viewport.name}.png`),
        });
        const stats = JSON.parse((await page.locator('canvas').getAttribute('data-render-stats'))!);
        const resolution = JSON.parse(
          (await page.locator('canvas').getAttribute('data-resolution-stats'))!,
        );
        expect(stats.drawCalls).toBeGreaterThan(0);
        writeFileSync(
          resolve(directory, `${restaurant.id}-${viewport.name}-stats.json`),
          await format(
            JSON.stringify({
              viewport,
              renderer: 'Chromium SwiftShader, touch profile; not native hardware',
              ...stats,
              resolution,
            }),
            { parser: 'json' },
          ),
        );
        if (viewport.name === 'desktop-1920') {
          const labels = page.locator('[data-station="board"]');
          const rect = await labels.boundingBox();
          if (rect) {
            if (process.env.PASS3_VERIFY === 'true') {
              const hud = await page.locator('.hud').boundingBox();
              expect(rect.y).toBeGreaterThanOrEqual(hud!.y + hud!.height);
              await expect(page.locator('body')).toHaveAttribute(
                'data-camera-profile',
                'desktop-overview',
              );
            }
            await page.screenshot({
              path: resolve(directory, `${restaurant.id}-equipment-closeup.png`),
              clip: {
                x: Math.max(0, rect.x - 60),
                y: Math.max(0, rect.y - 30),
                width: 160,
                height: 170,
              },
            });
          }
        } else {
          await page.locator('[data-action="camera"]').click();
          await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'chef');
          await page.waitForTimeout(300);
          await page.screenshot({
            path: resolve(directory, `${restaurant.id}-${viewport.name}-follow.png`),
          });
          await page.locator('[data-action="camera"]').click();
          await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('Pass 3 equipment inspection loads the actual runtime kit without a match', async ({
  page,
}) => {
  mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/art-study.html?mode=equipment');
  await expect(page.locator('canvas')).toHaveAttribute('data-study-ready', 'equipment');
  await page.screenshot({ path: resolve(directory, 'equipment-asset-study.png') });
  expect(errors).toEqual([]);
});
