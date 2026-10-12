import { test, expect } from '@playwright/test';

test('downloads CC0 kitchen sounds only after the player interacts', async ({ page }) => {
  const responses: Array<{ url: string; status: number }> = [];
  page.on('response', (response) => {
    if (response.url().includes('/assets/audio/'))
      responses.push({ url: response.url(), status: response.status() });
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      'kr-preferences-v1',
      JSON.stringify({ muted: false, quality: 'low', musicVolume: 0 }),
    );
    const audio = window.AudioContext;
    const nativeDecode = audio?.prototype.decodeAudioData;
    if (audio && nativeDecode) {
      (window as typeof window & { __krAudioDecoded: number[] }).__krAudioDecoded = [];
      audio.prototype.decodeAudioData = function (...args) {
        return nativeDecode.apply(this, args).then((buffer) => {
          (window as typeof window & { __krAudioDecoded: number[] }).__krAudioDecoded.push(
            buffer.duration,
          );
          return buffer;
        });
      };
    }
  });
  await page.goto('/');
  await page.waitForTimeout(200);
  expect(responses).toHaveLength(0);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.hud')).toBeVisible();
  await expect.poll(() => responses.length).toBe(6);
  expect(responses.every((response) => response.status === 200)).toBe(true);
  expect(new Set(responses.map((response) => new URL(response.url).pathname)).size).toBe(6);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __krAudioDecoded: number[] }).__krAudioDecoded?.length ?? 0,
      ),
    )
    .toBe(6);
});
