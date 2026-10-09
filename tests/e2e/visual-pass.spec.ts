import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { levels, restaurants, recipeById, items } from '../../packages/content/src/campaign';

async function station(page: import('@playwright/test').Page, id: string, holding?: string) {
  await page.locator(`[data-station="${id}"]`).click();
  if (holding) await expect(page.locator('#hand')).toHaveText(holding);
  else await page.waitForTimeout(1800);
}

async function assembleDish(page: import('@playwright/test').Page, levelId: string) {
  const level = levels.find((l) => l.id === levelId)!;
  const recipe = recipeById(level.recipes[0]);
  const hot = recipe.steps[0],
    cold = recipe.steps[1];
  const name = (kind: string) => items.get(kind)!.name.vi;
  await station(page, 'rack', 'Đĩa');
  await station(page, 'assembly', 'Tay trống');
  await station(page, 'meat', name(hot.inputs[0]));
  await station(page, 'stove', 'Tay trống');
  await station(page, 'lettuce', name(cold.inputs[0]));
  await station(page, 'board', 'Tay trống');
  for (let tap = 1; tap <= 3; tap++) {
    await page.locator('[data-station="board"]').click();
    await expect(page.locator('[data-station="board"] small')).toContainText(
      tap < 3 ? `${tap}/3` : 'Sẵn sàng',
    );
  }
  await station(page, 'board', name(cold.output));
  await station(page, 'assembly', 'Tay trống');
  await expect(page.locator('[data-station="stove"] small')).toHaveText('Sẵn sàng');
  await station(page, 'stove', name(hot.output));
  await station(page, 'assembly', 'Tay trống');
  await station(page, 'bun', name(level.stations.find((s) => s.id === 'bun')!.ingredient!));
  await station(page, 'assembly');
  await expect(page.locator('#label-assembly small')).toContainText(recipe.name.vi);
}

for (const restaurant of restaurants)
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ])
    test(`${restaurant.id} visual slice renders gameplay on ${viewport.name}`, async ({
      browser,
    }) => {
      test.setTimeout(180000);
      const levelId = levels.find(
        (l) =>
          l.restaurantId === restaurant.id && l.number === (restaurant.id === 'little-sun' ? 1 : 5),
      )!.id;
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.name === 'mobile',
        hasTouch: viewport.name === 'mobile',
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.addInitScript(
          (wins) => {
            localStorage.setItem('kr-campaign-wins', JSON.stringify(wins));
            localStorage.setItem('kr-preferences-v1', JSON.stringify({ quality: 'low' }));
          },
          levels.map((l) => l.id),
        );
        await page.goto('/');
        await page.locator('#campaign-level').selectOption(levelId);
        await page.getByRole('button', { name: 'Vào bếp' }).click();
        await expect(page.locator('.hud')).toBeVisible({ timeout: 30000 });
        if (viewport.name === 'desktop') {
          await page.locator('[data-action="camera"]').click();
          await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
          await assembleDish(page, levelId);
        } else await page.waitForTimeout(1800);
        // Cook using the supported low mode on software rendering, then verify
        // the actual standard-quality scene and shadows in every capture.
        await page.locator('[data-action="settings"]').click();
        await page.locator('#setting-quality').selectOption('standard');
        await page.keyboard.press('Escape');
        await expect(page.locator('body')).toHaveAttribute('data-quality', 'standard');
        await expect
          .poll(
            async () =>
              JSON.parse((await page.locator('canvas').getAttribute('data-render-stats')) ?? '{}')
                .quality,
          )
          .toBe('standard');
        await page.waitForTimeout(500);
        if (viewport.name === 'desktop')
          await expect(page.locator('#label-assembly')).toHaveAttribute(
            'data-context',
            /^(priority|nearby)$/,
          );
        else await expect(page.locator('#label-meat')).toHaveAttribute('aria-hidden', 'true');
        await expect(page.locator('#label-meat')).toHaveAttribute('data-context', 'idle');
        await page.mouse.move(viewport.width - 5, viewport.height - 5);
        await expect(page.locator('#label-meat')).toHaveCSS('opacity', '0.42');
        const rendered = await page.locator('canvas').evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
          if (!gl) return { width: canvas.width, height: canvas.height, distinctPixels: 0 };
          const sample = new Uint8Array(4);
          const colors = new Set<string>();
          for (let y = 0.08; y < 0.94; y += 0.09)
            for (let x = 0.04; x < 0.96; x += 0.08) {
              gl.readPixels(
                Math.floor(canvas.width * x),
                Math.floor(canvas.height * y),
                1,
                1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                sample,
              );
              colors.add(`${sample[0]},${sample[1]},${sample[2]}`);
            }
          return { width: canvas.width, height: canvas.height, distinctPixels: colors.size };
        });
        expect(rendered.width).toBeGreaterThan(320);
        expect(rendered.height).toBeGreaterThan(320);
        expect(rendered.distinctPixels).toBeGreaterThan(8);
        await page.screenshot({
          path: resolve(`docs/screenshots/${restaurant.id}-43-pass4-${viewport.name}.png`),
        });
        await expect(page.locator('canvas')).toHaveAttribute('data-render-stats', /meshes/);
        const before = JSON.parse(
          (await page.locator('canvas').getAttribute('data-render-stats'))!,
        );
        await page.waitForTimeout(2200);
        const after = JSON.parse((await page.locator('canvas').getAttribute('data-render-stats'))!);
        expect(after.drawCalls).toBeGreaterThan(0);
        expect(after.uniqueGeometries).toBeGreaterThan(0);
        expect(after.geometryBytesEstimated).toBeGreaterThan(0);
        expect(after.textureBytesEstimated).toBeGreaterThan(0);
        expect(after.shadowCasters).toBeGreaterThan(0);
        expect(after.meshes - before.meshes).toBeLessThan(100);
        expect(after.materials - before.materials).toBeLessThan(8);
        await test.info().attach('render-stats', {
          body: JSON.stringify({ before, after }),
          contentType: 'application/json',
        });
        writeFileSync(
          resolve(`docs/screenshots/${restaurant.id}-43-pass4-${viewport.name}-stats.json`),
          JSON.stringify(
            { renderer: 'Chromium SwiftShader (not a device benchmark)', viewport, before, after },
            null,
            2,
          ) + '\n',
        );
        if (viewport.name === 'desktop') {
          if (restaurant.id === 'little-sun') {
            const box = await page.locator('canvas').boundingBox();
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await page.mouse.wheel(0, -750);
              await page.waitForTimeout(600);
              await page.screenshot({
                path: resolve('docs/screenshots/little-sun-43-pass4-closeup.png'),
              });
            }
          }
          await page.evaluate(() => {
            const app = document.querySelector<HTMLElement>('#app');
            if (app) app.style.visibility = 'hidden';
          });
          await page.waitForTimeout(80);
          await page.locator('canvas').screenshot({
            path: resolve(`docs/screenshots/${restaurant.id}-43-pass4-world.png`),
          });
        }
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    });
