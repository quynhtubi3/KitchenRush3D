import { test, expect, type Page } from '@playwright/test';
import { levels, restaurants, recipeById, items } from '../../packages/content/src/campaign';

async function act(page: Page, id: string, holding: string) {
  await page.locator(`[data-station="${id}"]`).click();
  await expect(page.locator('#hand')).toHaveText(holding);
}
for (const restaurant of restaurants)
  test(`${restaurant.id}: loads all ten levels and serves a real dish`, async ({ page }) => {
    test.setTimeout(240000);
    // Navigation fixture only: no match state or result is injected.
    await page.addInitScript(
      (wins) => {
        localStorage.setItem('kr-campaign-wins', JSON.stringify(wins));
        localStorage.setItem(
          'kr-preferences-v1',
          JSON.stringify({ quality: 'low', reducedMotion: true, touchControls: 'tap' }),
        );
      },
      levels.map((l) => l.id),
    );
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    const content = levels.filter((l) => l.restaurantId === restaurant.id);
    for (const l of content) {
      await page.locator('#campaign-level').selectOption(l.id);
      await expect(page.locator('#campaign-level')).toHaveValue(l.id);
      await expect(page.locator('.location small')).toHaveText(l.name.vi);
      await expect(page.locator('.location-number')).toHaveText(String(l.number).padStart(2, '0'));
      for (const id of l.recipes) expect(recipeById(id).steps.length).toBeGreaterThan(0);
    }

    // Run the full server-authoritative recipe once per restaurant on its forgiving first shift.
    // All ten levels above are still selected and validated through the real campaign menu.
    const level = content[0];
    await page.locator('#campaign-level').selectOption(level.id);
    await page.locator('[data-action="play"]').click();
    await expect(page.locator('.hud .shift strong')).toHaveText(level.name.vi);
    await expect(page.locator('.station-label')).toHaveCount(level.stations.length);
    await expect(page.locator('#orders')).toContainText(`/ ${level.targetOrders}`);
    await page.locator('.game-tools [data-action="recipe"]').click();
    for (const id of level.recipes)
      await expect(page.locator('.notebook')).toContainText(recipeById(id).name.vi);
    await page.locator('.notebook-close').click();

    const recipe = recipeById(level.recipes[0]),
      hot = recipe.steps[0],
      cold = recipe.steps[1];
    const label = (kind: string) => items.get(kind)!.name.vi;
    await act(page, 'rack', 'Đĩa');
    await act(page, 'assembly', 'Tay trống');
    await act(page, 'meat', label(hot.inputs[0]));
    await act(page, 'stove', 'Tay trống');
    await act(page, 'lettuce', label(cold.inputs[0]));
    await act(page, 'board', 'Tay trống');
    for (let n = 1; n <= cold.taps; n++) {
      await page.locator('[data-station="board"]').click();
      await expect(page.locator('[data-station="board"] small')).toContainText(
        n === cold.taps ? 'Sẵn sàng' : `${n}/${cold.taps}`,
      );
    }
    await act(page, 'board', label(cold.output));
    await act(page, 'assembly', 'Tay trống');
    await expect(page.locator('[data-station="stove"] small')).toHaveText('Sẵn sàng');
    await act(page, 'stove', label(hot.output));
    await act(page, 'assembly', 'Tay trống');
    const raw = level.stations.find((s) => s.id === 'bun')!.ingredient!;
    await act(page, 'bun', label(raw));
    await act(page, 'assembly', 'Tay trống');
    await act(page, 'assembly', label(recipe.steps.at(-1)!.output));
    await act(page, 'seat1', 'Tay trống');
    await expect(page.locator('#orders')).toContainText('1');
    await page.screenshot({ path: `test-results/campaign-${restaurant.id}.png` });
    await page.screenshot({ path: `docs/screenshots/${restaurant.id}-43-desktop.png` });
    expect(errors).toEqual([]);
  });
