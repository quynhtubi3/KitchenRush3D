import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import pg from 'pg';

const testUrl = process.env.E2E_ACCOUNT_DATABASE_URL;
if (testUrl && !/(^|_)test($|_)/i.test(new URL(testUrl).pathname.slice(1)))
  throw new Error('E2E_ACCOUNT_DATABASE_URL must name an isolated test database.');

test('account UI: register, sign in on a second device, reject legacy unlocks and sign out', async ({
  browser,
}) => {
  test.skip(!testUrl, 'Requires a migrated and seeded PostgreSQL test database.');
  const db = new pg.Pool({ connectionString: testUrl });
  const first = await browser.newContext();
  const second = await browser.newContext();
  for (const context of [first, second])
    await context.addInitScript(() =>
      localStorage.setItem(
        'kr-preferences-v1',
        JSON.stringify({ quality: 'low', reducedMotion: true }),
      ),
    );
  const ids = new Set<string>();
  const email = `test+${randomUUID()}@example.test`;
  const displayName = `Tester ${randomUUID().slice(0, 6)}`;
  try {
    const page = await first.newPage();
    await page.addInitScript(() => localStorage.setItem('kr-campaign-wins', '["little-sun-01"]'));
    await page.goto('/');
    await expect.poll(async () => (await page.request.get('/api/account/me')).status()).toBe(200);
    const guest = await (await page.request.get('/api/account/me')).json();
    ids.add(guest.account.id);
    await page.locator('[data-action="account"]').click();
    await page.locator('#account-email').fill(email);
    await page.locator('#account-display-name').fill(displayName);
    await page.locator('#account-password').fill('safe test password 12');
    await page.locator('[data-action="account-register"]').click();
    await expect(page.locator('.account-toggle')).toHaveText(displayName);
    expect((await page.request.post('/api/account/logout')).status()).toBe(403);
    await page.locator('[data-action="account"]').click();
    await page.locator('#account-current-password').fill('safe test password 12');
    await page.locator('#account-next-password').fill('safe changed password 34');
    await page.locator('[data-action="account-password"]').click();
    await expect(page.locator('.account-message')).toHaveText(
      /Password changed\.|Đã đổi mật khẩu\./,
    );
    // The option now lives in an optgroup; assert the native option lock rather
    // than Playwright's generic enabled-state matcher for interactive controls.
    await expect(page.locator('#campaign-level option[value="little-sun-02"]')).toHaveAttribute(
      'disabled',
      '',
    );
    const other = await second.newPage();
    await other.goto('/');
    await expect.poll(async () => (await other.request.get('/api/account/me')).status()).toBe(200);
    const otherGuest = await (await other.request.get('/api/account/me')).json();
    ids.add(otherGuest.account.id);
    await other.locator('[data-action="account"]').click();
    await other.locator('#account-email').fill(email);
    await other.locator('#account-password').fill('safe changed password 34');
    await other.locator('[data-action="account-login"]').click();
    await expect(other.locator('.account-toggle')).toHaveText(displayName);
    const signedIn = await (await other.request.get('/api/account/me')).json();
    expect(signedIn.account.id).toBe(guest.account.id);
    expect(signedIn.progress.unlocked).toEqual(['little-sun-01']);
    expect(
      (await other.request.post('/api/account/result', { data: { won: true, stars: 3 } })).status(),
    ).toBe(404);
    await other.locator('[data-action="account"]').click();
    await other.locator('[data-action="account-logout"]').click();
    await expect(other.locator('.account-toggle')).not.toHaveText(displayName);
    const loggedOut = await (await other.request.get('/api/account/me')).json();
    ids.add(loggedOut.account.id);
    expect(loggedOut.account.isGuest).toBe(true);
    expect((await (await page.request.get('/api/account/me')).json()).account.id).toBe(
      guest.account.id,
    );
    const rateLimit = await other.evaluate(async () => {
      const csrf = await (await fetch('/api/account/csrf')).json();
      const attempt = () =>
        fetch('/api/account/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.csrfToken },
          body: JSON.stringify({ email: 'unknown@example.test', password: 'incorrect password' }),
        });
      const first = await attempt();
      const firstBody = await first.json();
      const statuses = [first.status];
      while (statuses.length < 20 && statuses.at(-1) !== 429)
        statuses.push((await attempt()).status);
      return { firstStatus: first.status, firstBody, statuses };
    });
    expect(rateLimit.firstStatus).toBe(401);
    expect(rateLimit.firstBody).toEqual({ error: 'invalidCredentials' });
    expect(rateLimit.statuses.at(-1)).toBe(429);
    expect(rateLimit.statuses.slice(0, -1).every((status) => status === 401)).toBe(true);
  } finally {
    await first.close();
    await second.close();
    await db.query(
      'DELETE FROM player_profile WHERE id=ANY($1::uuid[]) AND merged_into IS NOT NULL',
      [[...ids]],
    );
    await db.query('DELETE FROM player_profile WHERE id=ANY($1::uuid[])', [[...ids]]);
    await db.end();
  }
});
