import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { levels, restaurants, recipeById, items } from '../../packages/content/src/campaign';

async function assembleDish(page: import('@playwright/test').Page, levelId: string) {
  const level = levels.find((l) => l.id === levelId)!;
  // Cook the recipe on a real guest ticket. These levels have signature variants
  // that share their first components, so assuming recipes[0] can lock the plate
  // to a different valid order before the final component is added.
  const ticket = page.locator('.ticket').first();
  await expect(ticket).toBeVisible({ timeout: 15000 });
  const ticketTitle = await ticket.locator('strong').innerText();
  const recipe = level.recipes
    .map(recipeById)
    .find((entry) => ticketTitle.startsWith(entry.name.vi));
  if (!recipe) throw new Error(`Could not match guest ticket to a recipe: ${ticketTitle}`);
  await ticket.click();
  const interact = async (id: string) => page.locator(`[data-station="${id}"]`).click();
  const prepare = async (kind: string, visiting = new Set<string>()): Promise<void> => {
    if (visiting.has(kind)) throw new Error(`Recipe graph cycle at ${recipe.id}:${kind}`);
    const source = level.stations.find((entry) => entry.ingredient === kind);
    if (source) {
      await interact(source.id);
      await expect(page.locator('#hand')).toHaveText(items.get(kind)!.name.vi);
      return;
    }
    const step = recipe.steps.find((entry) => entry.output === kind);
    if (!step || step.station === 'assembly') throw new Error(`No source for ${recipe.id}:${kind}`);
    const next = new Set(visiting).add(kind);
    for (const input of step.inputs) await prepare(input, next);
    await interact(step.station);
    await expect(page.locator('#hand')).toHaveText('Tay trống');
    for (let tap = 0; tap < step.taps; tap++) await interact(step.station);
    await expect(page.locator(`#label-${step.station}`)).toHaveAttribute('data-feedback', 'ready', {
      timeout: Math.max(15000, step.seconds * 1000 + 5000),
    });
    await interact(step.station);
    await expect(page.locator('#hand')).toHaveText(items.get(kind)!.name.vi);
  };
  await page.locator('.game-tools [data-action="recipe"]').click();
  await page.locator(`[data-recipe="${recipe.id}"]`).click();
  await page.locator('.notebook-close').click();
  await interact('rack');
  await expect(page.locator('#hand')).not.toHaveText('Tay trống');
  await interact('assembly');
  await expect(page.locator('#hand')).toHaveText('Tay trống');
  for (const component of recipe.components) {
    await prepare(component);
    await interact('assembly');
    await expect(page.locator('#hand')).toHaveText('Tay trống');
  }
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
        // Chaotic Pop keeps idle station labels more visible than the previous muted UI.
        await expect(page.locator('#label-meat')).toHaveCSS('opacity', '0.7');
        const rendered = await page.locator('canvas').evaluate(
          (element) =>
            new Promise<{ width: number; height: number; distinctPixels: number }>((resolve) => {
              const canvas = element as HTMLCanvasElement;
              // WebGL clears non-preserved buffers after compositing. Read in the render callback,
              // retaining the exact same pixel-diversity assertions without imposing a runtime cost.
              canvas.dispatchEvent(
                new CustomEvent('kitchen-read-frame', {
                  detail: () => {
                    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
                    if (!gl) {
                      resolve({ width: canvas.width, height: canvas.height, distinctPixels: 0 });
                      return;
                    }
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
                    resolve({
                      width: canvas.width,
                      height: canvas.height,
                      distinctPixels: colors.size,
                    });
                  },
                }),
              );
            }),
        );
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
