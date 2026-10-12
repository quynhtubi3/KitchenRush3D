import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { levels, restaurants } from '../../packages/content/src/campaign';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

for (const restaurant of restaurants)
  for (const viewport of viewports)
    test(`${restaurant.id} graphics capture on ${viewport.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.name === 'mobile',
        hasTouch: viewport.name === 'mobile',
      });
      try {
        const page = await context.newPage();
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
        await page.locator('[data-action="camera"]').click();
        await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
        await expect(page.locator('canvas')).toHaveAttribute('data-render-stats', /drawCalls/);
        await page.waitForTimeout(500);
        const directory = resolve(
          process.env.GRAPHICS_CAPTURE_DIR ?? 'docs/screenshots/graphics-overhaul-after',
        );
        mkdirSync(directory, { recursive: true });
        await page.screenshot({
          path: resolve(directory, `${restaurant.id}-${viewport.name}.png`),
          animations: 'disabled',
        });
        const stats = JSON.parse((await page.locator('canvas').getAttribute('data-render-stats'))!);
        expect(stats.drawCalls).toBeGreaterThan(0);
        expect(stats.triangles).toBeGreaterThan(0);
        writeFileSync(
          resolve(directory, `${restaurant.id}-${viewport.name}-stats.json`),
          JSON.stringify(
            { renderer: 'Chromium SwiftShader (not a device benchmark)', viewport, ...stats },
            null,
            2,
          ) + '\n',
        );
        if (viewport.name === 'mobile') {
          await page.locator('[data-action="camera"]').click();
          await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'chef');
          await page.waitForTimeout(300);
          await page.screenshot({
            path: resolve(directory, `${restaurant.id}-mobile-follow.png`),
            animations: 'disabled',
          });
        } else if (/pass[23]/.test(process.env.GRAPHICS_CAPTURE_DIR ?? '')) {
          const rect = await page.locator('canvas').boundingBox();
          if (rect)
            await page.screenshot({
              path: resolve(directory, `${restaurant.id}-floor-closeup.png`),
              clip: {
                x: rect.x + rect.width * 0.32,
                y: rect.y + rect.height * 0.55,
                width: rect.width * 0.3,
                height: rect.height * 0.24,
              },
            });
        }
      } finally {
        await context.close();
      }
    });
