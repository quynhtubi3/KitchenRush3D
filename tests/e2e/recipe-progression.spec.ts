import { test, expect } from '@playwright/test';
import { getLevel, recipeById, levels, items } from '../../packages/content/src/campaign';

test('mixed menu lets the player select, cook and serve a cheeseburger', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    localStorage.setItem('kr-campaign-wins', JSON.stringify(['little-sun-01']));
    localStorage.setItem(
      'kr-preferences-v1',
      JSON.stringify({ quality: 'low', reducedMotion: true }),
    );
  });
  await page.goto('/');
  await page.locator('#campaign-level').selectOption('little-sun-02');
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.hud')).toBeVisible();
  await page.locator('[data-action="camera"]').click();
  const recipe = recipeById('sunshine-cheeseburger');
  const ticket = page.locator('.ticket').filter({ hasText: recipe.name.vi });
  await expect(ticket).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.ticket')).toHaveCount(2, { timeout: 60000 });
  await expect(
    page.locator('.ticket').filter({ hasText: recipeById('sunshine-burger').name.vi }),
  ).toBeVisible();
  const seat = (await ticket.locator('small').innerText()).includes('1') ? 'seat1' : 'seat2';
  await ticket.click();
  const act = async (station: string, kind?: string) => {
    await page.locator(`[data-station="${station}"]`).click();
    await expect(page.locator('#hand')).toHaveText(
      kind === 'plate' ? 'Đĩa' : kind ? items.get(kind)!.name.vi : 'Tay trống',
    );
  };
  await act('rack', 'plate');
  await act('assembly');
  for (const component of recipe.components) {
    const step = recipe.steps.find((entry) => entry.output === component);
    const raw = step?.inputs[0] ?? component;
    const source = getLevel('little-sun-02').stations.find(
      (station) => station.ingredient === raw,
    )!;
    await act(source.id, raw);
    if (step) {
      await act(step.station);
      for (let tap = 1; tap <= step.taps; tap++) {
        await page.locator(`[data-station="${step.station}"]`).click();
        await expect(page.locator(`[data-station="${step.station}"] small`)).toContainText(
          tap === step.taps ? 'Sẵn sàng' : `${tap}/${step.taps}`,
        );
      }
      await expect(page.locator(`[data-station="${step.station}"] small`)).toContainText(
        'Sẵn sàng',
      );
      await act(step.station, component);
    }
    await act('assembly');
  }
  await act('assembly', 'cheeseburger');
  await page.screenshot({ path: 'docs/screenshots/pass-7/cheeseburger-cooked.png' });
  await act(seat);
  await expect(ticket).toHaveCount(0);
});

test('Little Sun level ten presents the complete five-dish recipe book on desktop and mobile', async ({
  page,
}) => {
  test.setTimeout(90000);
  const level = getLevel('little-sun-10');
  await page.addInitScript(
    (wins) => {
      localStorage.setItem('kr-campaign-wins', JSON.stringify(wins));
      localStorage.setItem(
        'kr-preferences-v1',
        JSON.stringify({ quality: 'low', reducedMotion: true, touchControls: 'tap' }),
      );
    },
    levels.map((entry) => entry.id),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('#campaign-level').selectOption(level.id);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.hud .shift strong')).toHaveText(level.name.vi);
  await page.locator('.game-tools [data-action="recipe"]').click();
  for (const id of level.recipes)
    await expect(page.locator('.notebook')).toContainText(recipeById(id).name.vi);
  await expect(page.locator('.recipe-tab')).toHaveCount(5);
  await page.locator('[data-recipe="sunshine-cheeseburger"]').click();
  await expect(page.locator('.notebook h2')).toHaveText(
    recipeById('sunshine-cheeseburger').name.vi,
  );
  await expect(page.locator('.recipe-steps')).toHaveCount(1);
  await page.screenshot({
    path: 'docs/screenshots/pass-7/little-sun-10-recipes-desktop.png',
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.notebook')).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/pass-7/little-sun-10-recipes-mobile.png',
    fullPage: false,
  });
  expect(errors).toEqual([]);
});

test('mobile players can see and tap the new ingredient dispensers from their front row', async ({
  browser,
}) => {
  test.setTimeout(150000);
  const level = getLevel('little-sun-10');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(
      (wins) => localStorage.setItem('kr-campaign-wins', JSON.stringify(wins)),
      levels.map((entry) => entry.id),
    );
    await page.goto('/');
    await page.locator('#campaign-level').selectOption(level.id);
    await page.locator('[data-action="play"]').click();
    await expect(page.locator('.hud')).toBeVisible();
    await expect(page.locator('.veil')).toBeHidden({ timeout: 10000 });

    await page.locator('.game-tools [data-action="recipe"]').click();
    await expect(page.locator('.notebook')).toContainText(
      recipeById('sunshine-cheeseburger').name.vi,
    );
    await expect(page.locator('.notebook')).toContainText(
      recipeById('sunshine-chicken-burger').name.vi,
    );
    await page.screenshot({ path: 'docs/screenshots/pass-7/little-sun-10-mobile-recipe-book.png' });
    await page.locator('.notebook-close').click();
    await page.screenshot({
      path: 'docs/screenshots/pass-7/little-sun-10-mobile-ingredient-row.png',
    });

    const dispensers = level.stations.filter((station) => station.id.startsWith('ingredient-'));
    expect(dispensers.length).toBeGreaterThan(0);
    for (const dispenser of dispensers) {
      const label = page.locator(`#label-${dispenser.id}`);
      await expect(label).toBeVisible({ timeout: 10000 });
    }
    const firstDispenser = dispensers[0];
    await page.locator(`#label-${firstDispenser.id}`).tap();
    await expect(page.locator('#hand')).toHaveText(items.get(firstDispenser.ingredient!)!.name.vi, {
      timeout: 15000,
    });
  } finally {
    await context.close();
  }
});
