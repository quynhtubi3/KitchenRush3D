/** Run against an already running production server: npx tsx tools/performance-pass5.ts */
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { levels, restaurants } from '../packages/content/src/campaign';
import { renderResolution } from '../apps/client/src/game/render-resolution';

const output = 'docs/screenshots/pass5/audit';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const rows: unknown[] = [];
try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000, dpr: 1 },
    { name: 'portrait', width: 390, height: 844, dpr: 3 },
    { name: 'landscape', width: 844, height: 390, dpr: 3 },
  ]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: viewport.dpr,
      isMobile: viewport.dpr > 1,
      hasTouch: viewport.dpr > 1,
    });
    const page = await context.newPage();
    await page.addInitScript(
      (wins) => {
        localStorage.setItem('kr-campaign-wins', JSON.stringify(wins));
        localStorage.setItem('kr-preferences-v1', JSON.stringify({ quality: 'low', muted: true }));
      },
      levels.map((level) => level.id),
    );
    const loadStart = Date.now();
    await page.goto(process.env.E2E_BASE_URL ?? 'http://127.0.0.1:2570');
    await expect(page.locator('[data-action="play"]')).toBeVisible();
    const menuLoadMs = Date.now() - loadStart;
    for (const restaurant of restaurants) {
      await page
        .locator('#campaign-level')
        .selectOption(levels.find((l) => l.restaurantId === restaurant.id)!.id);
      const entryStart = Date.now();
      await page.locator('[data-action="play"]').click();
      await expect(page.locator('.hud')).toBeVisible();
      const entryMs = Date.now() - entryStart;
      await page.locator('[data-action="pause"]').click();
      // Freeze the real Solo match, preserving a matched scene across profiles.
      await page.addStyleTag({ content: '.veil { visibility: hidden !important; }' });
      for (const quality of ['low', 'standard', 'high']) {
        await page.locator('[data-action="settings"]').click();
        await page.locator('#setting-quality').selectOption(quality);
        await page.keyboard.press('Escape');
        await expect
          .poll(
            async () =>
              JSON.parse((await page.locator('canvas').getAttribute('data-render-stats')) ?? '{}')
                .quality,
          )
          .toBe(quality);
        // Short software-renderer sample, not a steady-state physical-device benchmark.
        const frameSample = await page.evaluate(`new Promise(resolve => {
          const times = [];
          const start = performance.now();
          let previous = start;
          function sample(now) {
            times.push(now - previous);
            previous = now;
            if (now - start < 5000) return void requestAnimationFrame(sample);
            times.sort((a, b) => a - b);
            const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
            resolve({ mean, p95: times[Math.floor((times.length - 1) * .95)], p99: times[Math.floor((times.length - 1) * .99)], fps: 1000 / mean, frames: times.length });
          }
          requestAnimationFrame(sample);
        })`);
        const data = await page.locator('canvas').evaluate((canvas) => ({
          resolution: JSON.parse(canvas.getAttribute('data-resolution-stats') ?? '{}'),
          render: JSON.parse(canvas.getAttribute('data-render-stats') ?? '{}'),
          heap:
            (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
              ?.usedJSHeapSize ?? null,
        }));
        const row = {
          restaurant: restaurant.id,
          viewport,
          quality,
          menuLoadMs,
          entryMs,
          frameSample,
          ...data,
        };
        const target = renderResolution(
          data.resolution.css[0],
          data.resolution.css[1],
          viewport.dpr,
          quality,
        );
        expect(data.resolution.buffer[0]).toBeCloseTo(target.width, 0);
        expect(data.resolution.buffer[1]).toBeCloseTo(target.height, 0);
        expect(data.resolution.profile).toBe(quality === 'standard' ? 'balanced' : quality);
        rows.push(row);
        writeFileSync(
          `${output}/measurements.json`,
          JSON.stringify(
            {
              environment:
                'Chromium SwiftShader; sequential paused scenes; rolling frame window can include prior profile and loading; NOT mobile GPU benchmark',
              rows,
            },
            null,
            2,
          ),
        );
        await page.screenshot({
          path: `${output}/${restaurant.id}-${viewport.name}-${quality}.png`,
        });
        console.log(
          `${restaurant.id} ${viewport.name} ${quality}: ${data.render.drawCalls} draws, ${data.render.fps} software FPS`,
        );
      }
      await page
        .locator('[data-action="home"]')
        .last()
        .evaluate((button: HTMLElement) => button.click());
      await expect(page.locator('#campaign-level')).toBeVisible();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
