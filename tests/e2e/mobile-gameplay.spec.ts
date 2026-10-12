import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { levels } from '../../packages/content/src/campaign';

const viewports = [
  { id: 'desktop-1920x1080', width: 1920, height: 1080, touch: false },
  { id: 'portrait-390x844', width: 390, height: 844, touch: true },
  { id: 'portrait-430x932', width: 430, height: 932, touch: true },
  { id: 'landscape-844x390', width: 844, height: 390, touch: true },
  { id: 'small-360x640', width: 360, height: 640, touch: true },
  { id: 'tablet-768x1024', width: 768, height: 1024, touch: true },
] as const;

for (const viewport of viewports)
  test(`mobile-first gameplay reference ${viewport.id}`, async ({ browser }) => {
    test.setTimeout(60000);
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.touch,
      hasTouch: viewport.touch,
    });
    const page = await context.newPage();
    try {
      await page.addInitScript(
        ({ wins, touch }) => {
          localStorage.setItem('kr-campaign-wins', JSON.stringify(wins));
          localStorage.setItem(
            'kr-preferences-v1',
            JSON.stringify({ touchControls: touch ? 'joystick' : 'tap' }),
          );
        },
        { wins: levels.map((level) => level.id), touch: viewport.touch },
      );
      await page.goto('/');
      await page.locator('#campaign-level').selectOption('little-sun-01');
      await page.getByRole('button', { name: 'Vào bếp' }).click();
      await expect(page.locator('.hud')).toBeVisible({ timeout: 30000 });
      if (viewport.touch) await expect(page.locator('#joystick')).toBeVisible();
      await page.waitForTimeout(800);
      if (viewport.touch) {
        const ordersToggle = page.locator('.orders-toggle');
        const compactOrders = viewport.width <= 700 || viewport.id === 'landscape-844x390';
        if (compactOrders) await expect(page.locator('.orders-content')).toBeHidden();
        await ordersToggle.click();
        await expect(ordersToggle).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('.orders-content')).toBeVisible();
        await ordersToggle.click();
        await expect(ordersToggle).toHaveAttribute('aria-expanded', 'false');
        if (compactOrders) await expect(page.locator('.orders-content')).toBeHidden();
      }
      await page.locator('[data-action="pause"]').click();
      await expect(page.locator('.veil')).toBeVisible();
      await page.addStyleTag({ content: '.veil { visibility: hidden !important; }' });
      await expect(page.locator('#game')).toHaveAttribute('data-camera-stats', /profile/, {
        timeout: 10000,
      });
      const layout = await page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
        const rect = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element || getComputedStyle(element).display === 'none') return null;
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const canvasBounds = canvas.getBoundingClientRect();
        const overlays = [
          '.topbar',
          '.hud',
          '.orders-list',
          '.bottom-bar',
          '.game-tools',
          '.help-card',
          '#joystick',
          '#touch-interact',
          '#team-panel',
        ]
          .map(rect)
          .filter((value): value is NonNullable<typeof value> => value !== null);
        let covered = 0;
        let samples = 0;
        for (let y = canvasBounds.top + 3; y < canvasBounds.bottom; y += 8)
          for (let x = canvasBounds.left + 3; x < canvasBounds.right; x += 8) {
            samples++;
            if (
              overlays.some(
                (box) =>
                  x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height,
              )
            )
              covered++;
          }
        return {
          viewport: { width: innerWidth, height: innerHeight },
          canvas: (() => {
            const { x, y, width, height } = canvas.getBoundingClientRect();
            const style = getComputedStyle(canvas);
            return {
              x,
              y,
              width,
              height,
              cssHeight: style.height,
              cssTop: style.top,
              cssBottom: style.bottom,
            };
          })(),
          hud: rect('.hud'),
          orders: rect('.orders-list'),
          hand: rect('.bottom-bar'),
          joystick: rect('#joystick'),
          interact: rect('#touch-interact'),
          camera: JSON.parse(canvas.dataset.cameraStats ?? '{}'),
          gameplayOcclusionPercent: Number(((covered / Math.max(1, samples)) * 100).toFixed(1)),
          stationLabels: Array.from(document.querySelectorAll<HTMLElement>('.station-label')).map(
            (el) => ({
              id: el.dataset.station,
              context: el.dataset.context,
              onScreen: el.dataset.onScreen === 'true',
              offscreen: el.dataset.offscreen === 'true',
              x: Math.round(el.getBoundingClientRect().x),
              y: Math.round(el.getBoundingClientRect().y),
            }),
          ),
        };
      });
      const expectedProfile =
        viewport.id === 'desktop-1920x1080'
          ? 'desktop-overview'
          : viewport.id === 'landscape-844x390'
            ? 'mobile-landscape'
            : viewport.id === 'tablet-768x1024'
              ? 'tablet-portrait'
              : 'mobile-portrait';
      expect(layout.camera.profile).toBe(expectedProfile);
      if (viewport.id === 'portrait-390x844') {
        expect(layout.canvas.y).toBeGreaterThanOrEqual(120);
        expect(layout.canvas.height).toBeGreaterThan(590);
        expect(layout.canvas.height).toBeLessThan(650);
        expect(layout.canvas.cssHeight).not.toBe('844px');
        expect(layout.canvas.y + layout.canvas.height).toBeLessThanOrEqual(740);
        expect(layout.camera.zoom).toBeGreaterThan(1.4);
        expect(layout.camera.stageCanvasAreaPercent).toBeGreaterThan(70);
        expect(layout.camera.stationLabelsOverlapPairs).toBe(0);
      }
      if (viewport.id === 'landscape-844x390') {
        expect(layout.canvas.y).toBeGreaterThanOrEqual(75);
        expect(layout.canvas.height).toBeLessThan(330);
      }
      expect(layout.camera.chefHeightPx).toBeGreaterThanOrEqual(
        viewport.id === 'desktop-1920x1080' ? 24 : viewport.id === 'landscape-844x390' ? 40 : 55,
      );
      expect(Math.abs(layout.camera.targetX)).toBeLessThanOrEqual(layout.camera.targetBoundX);
      expect(Math.abs(layout.camera.targetZ)).toBeLessThanOrEqual(layout.camera.targetBoundZ);
      expect(layout.gameplayOcclusionPercent).toBeLessThan(38);
      expect(
        layout.stationLabels.filter((station) => station.onScreen || station.offscreen).length,
      ).toBeGreaterThan(0);
      expect(layout.camera.stationLabelsOverlapPairs).toBe(0);
      if (viewport.touch) {
        await expect(page.locator('#touch-interact')).toBeVisible();
        await expect(page.locator('#touch-interact')).toHaveAttribute('aria-label', /\S/);
      }
      mkdirSync(resolve('docs/screenshots/pass5b'), { recursive: true });
      await page.screenshot({ path: resolve(`docs/screenshots/pass5b/${viewport.id}-follow.png`) });
      await test.info().attach('layout-after', {
        body: JSON.stringify(layout, null, 2),
        contentType: 'application/json',
      });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        resolve(`docs/screenshots/pass5b/${viewport.id}-stats.json`),
        `${JSON.stringify(layout, null, 2)}\n`,
      );
    } finally {
      await context.close();
    }
  });

test('tap-to-move sends a floor destination to the server on touch', async ({ browser }) => {
  test.setTimeout(60000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(() =>
      localStorage.setItem('kr-preferences-v1', JSON.stringify({ touchControls: 'tap' })),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Vào bếp' }).click();
    const canvas = page.locator('#game');
    await expect(canvas).toBeVisible();
    const canvasBox = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: 100, y: canvasBox.height * 0.56 } });
    await expect
      .poll(
        async () => JSON.parse((await canvas.getAttribute('data-camera-stats')) ?? '{}').chefX,
        { timeout: 10000 },
      )
      .not.toBe(0);
  } finally {
    await context.close();
  }
});

test('portrait camera overview and follow modes switch and stay measurable', async ({
  browser,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Vào bếp' }).click();
    await expect(page.locator('.hud')).toBeVisible();
    await page.waitForTimeout(750);
    await page.locator('[data-action="pause"]').click();
    await page.addStyleTag({ content: '.veil { visibility: hidden !important; }' });
    const canvas = page.locator('#game');
    const button = page.locator('[data-action="camera"]');
    await expect(button).toHaveAttribute('aria-label', /Toàn cảnh/);
    await button.click();
    await expect(button).toHaveAttribute('aria-label', /Theo đầu bếp/);
    await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'overview');
    await expect
      .poll(async () => JSON.parse((await canvas.getAttribute('data-camera-stats')) ?? '{}').zoom)
      .toBeLessThan(1.1);
    mkdirSync(resolve('docs/screenshots/pass5b'), { recursive: true });
    await page.screenshot({
      path: resolve('docs/screenshots/pass5b/portrait-390x844-overview.png'),
    });
    await button.click();
    await expect(button).toHaveAttribute('aria-label', /Toàn cảnh/);
    await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'chef');
    await expect
      .poll(async () => JSON.parse((await canvas.getAttribute('data-camera-stats')) ?? '{}').zoom)
      .toBeGreaterThan(1.4);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect
      .poll(
        async () => JSON.parse((await canvas.getAttribute('data-camera-stats')) ?? '{}').profile,
      )
      .toBe('mobile-landscape');
    await expect(page.locator('body')).toHaveAttribute('data-camera-focus', 'chef');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(
        async () => JSON.parse((await canvas.getAttribute('data-camera-stats')) ?? '{}').profile,
      )
      .toBe('mobile-portrait');
  } finally {
    await context.close();
  }
});

test('desktop WASD movement follows the camera-relative grid', async ({ browser }) => {
  test.setTimeout(60000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Vào bếp' }).click();
    const canvas = page.locator('#game');
    await expect(page.locator('.hud')).toBeVisible();
    await expect
      .poll(async () => JSON.parse((await canvas.getAttribute('data-camera-stats')) ?? '{}').chefX)
      .toBe(0);
    await page.keyboard.down('a');
    await expect
      .poll(
        async () => JSON.parse((await canvas.getAttribute('data-camera-stats')) ?? '{}').chefX,
        { timeout: 10000 },
      )
      .toBeGreaterThan(0);
    await page.keyboard.up('a');
  } finally {
    await context.close();
  }
});
