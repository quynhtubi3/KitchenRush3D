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
  const ids = new Set<string>();
  const username = `test_${randomUUID().slice(0, 8)}`;
  try {
    const page = await first.newPage();
    await page.addInitScript(() => localStorage.setItem('kr-campaign-wins', '["little-sun-01"]'));
    await page.goto('/');
    await expect.poll(async () => (await page.request.get('/api/account/me')).status()).toBe(200);
    const guest = await (await page.request.get('/api/account/me')).json();
    ids.add(guest.account.id);
    await page.locator('[data-action="account"]').click();
    await page.locator('#account-username').fill(username);
    await page.locator('#account-password').fill('safe test password 12');
    await page.locator('[data-action="account-register"]').click();
    await expect(page.locator('.account-toggle')).toHaveText(username);
    await expect(page.locator('#campaign-level option[value="little-sun-02"]')).toBeDisabled();
    const other = await second.newPage();
    await other.goto('/');
    await expect.poll(async () => (await other.request.get('/api/account/me')).status()).toBe(200);
    const otherGuest = await (await other.request.get('/api/account/me')).json();
    ids.add(otherGuest.account.id);
    await other.locator('[data-action="account"]').click();
    await other.locator('#account-username').fill(username);
    await other.locator('#account-password').fill('safe test password 12');
    await other.locator('[data-action="account-login"]').click();
    await expect(other.locator('.account-toggle')).toHaveText(username);
    const signedIn = await (await other.request.get('/api/account/me')).json();
    expect(signedIn.account.id).toBe(guest.account.id);
    expect(signedIn.progress.unlocked).toEqual(['little-sun-01']);
    expect(
      (await other.request.post('/api/account/result', { data: { won: true, stars: 3 } })).status(),
    ).toBe(404);
    await other.locator('[data-action="account"]').click();
    await other.locator('[data-action="account-logout"]').click();
    await expect(other.locator('.account-toggle')).not.toHaveText(username);
    const loggedOut = await (await other.request.get('/api/account/me')).json();
    ids.add(loggedOut.account.id);
    expect(loggedOut.account.isGuest).toBe(true);
    expect((await (await page.request.get('/api/account/me')).json()).account.id).toBe(
      guest.account.id,
    );
  } finally {
    await first.close();
    await second.close();
    for (const id of ids) await db.query('DELETE FROM player_profile WHERE id=$1', [id]);
    await db.end();
  }
});
