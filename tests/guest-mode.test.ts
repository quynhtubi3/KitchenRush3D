import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it('explicit Guest mode never initializes account persistence even with a database URL', async () => {
  vi.resetModules();
  vi.stubEnv('GUEST_ONLY', 'true');
  vi.stubEnv('DATABASE_URL', 'postgres://unused:unused@127.0.0.1:1/unused');
  const database = await import('../apps/server/src/persistence/database');
  expect(database.accountsConfigured).toBe(false);
  expect(database.pool).toBeNull();
  expect(await database.databaseAvailable()).toBe(false);
});
it('a configured account mode does not silently downgrade on a database connection failure', async () => {
  vi.resetModules();
  vi.stubEnv('GUEST_ONLY', 'false');
  vi.stubEnv('DATABASE_URL', 'postgres://unused:unused@127.0.0.1:1/unused');
  const database = await import('../apps/server/src/persistence/database');
  try {
    expect(database.accountsConfigured).toBe(true);
    expect(await database.databaseAvailable()).toBe(false);
    expect(database.accountsConfigured).toBe(true);
  } finally {
    await database.pool?.end();
  }
});
