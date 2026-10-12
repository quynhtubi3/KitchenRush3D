import { afterEach, expect, it, vi } from 'vitest';
import { access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it('explicit Guest mode never initializes account persistence even with a database URL', async () => {
  vi.resetModules();
  vi.stubEnv('GUEST_ONLY', 'true');
  vi.stubEnv('DATABASE_URL', 'postgres://unused:unused@127.0.0.1:1/unused');
  const directory = join(tmpdir(), `kr-guest-no-journal-${randomUUID()}`);
  vi.stubEnv('MATCH_OUTBOX_DIR', directory);
  const database = await import('../apps/server/src/persistence/database');
  expect(database.accountsConfigured).toBe(false);
  expect(database.pool).toBeNull();
  expect(await database.databaseAvailable()).toBe(false);
  const persistence = await import('../apps/server/src/persistence/match-persistence');
  await persistence.startMatchPersistence();
  await persistence.stopMatchPersistence();
  await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('database availability alone does not enable accounts or change Guest mode', async () => {
  vi.resetModules();
  vi.stubEnv('GUEST_ONLY', 'false');
  vi.stubEnv('DATABASE_URL', 'postgres://unused:unused@127.0.0.1:1/unused');
  const database = await import('../apps/server/src/persistence/database');
  expect(database.accountsConfigured).toBe(false);
  expect(database.pool).toBeNull();
});

it('authentication and cloud persistence enable independently and report an unavailable database', async () => {
  vi.resetModules();
  vi.stubEnv('GUEST_ONLY', 'false');
  vi.stubEnv('DATABASE_URL', 'postgres://unused:unused@127.0.0.1:1/unused');
  vi.stubEnv('AUTH_ENABLED', 'true');
  vi.stubEnv('REGISTRATION_ENABLED', 'true');
  const database = await import('../apps/server/src/persistence/database');
  try {
    expect(database.accountsConfigured).toBe(true);
    expect(database.authEnabled).toBe(true);
    expect(database.registrationEnabled).toBe(true);
    expect(database.cloudSaveEnabled).toBe(false);
    expect(await database.databaseAvailable()).toBe(false);
    expect(database.accountsConfigured).toBe(true);
  } finally {
    await database.pool?.end();
  }
});

it('cloud save can be enabled without enabling account login or registration', async () => {
  vi.resetModules();
  vi.stubEnv('GUEST_ONLY', 'false');
  vi.stubEnv('DATABASE_URL', 'postgres://unused:unused@127.0.0.1:1/unused');
  vi.stubEnv('CLOUD_SAVE_ENABLED', 'true');
  const database = await import('../apps/server/src/persistence/database');
  try {
    expect(database.cloudSaveEnabled).toBe(true);
    expect(database.authEnabled).toBe(false);
    expect(database.registrationEnabled).toBe(false);
  } finally {
    await database.pool?.end();
  }
});

it('keeps registration disabled in production even when an operator sets the flag', async () => {
  vi.resetModules();
  vi.stubEnv('GUEST_ONLY', 'false');
  vi.stubEnv('DATABASE_URL', 'postgres://unused:unused@127.0.0.1:1/unused');
  vi.stubEnv('AUTH_ENABLED', 'true');
  vi.stubEnv('REGISTRATION_ENABLED', 'true');
  vi.stubEnv('CLOUD_SAVE_ENABLED', 'true');
  vi.stubEnv('NODE_ENV', 'production');
  const database = await import('../apps/server/src/persistence/database');
  try {
    expect(database.authEnabled).toBe(true);
    expect(database.cloudSaveEnabled).toBe(true);
    expect(database.registrationEnabled).toBe(false);
  } finally {
    await database.pool?.end();
  }
});

it('enables production registration only with authenticated SMTP and a valid HTTPS or tunnel origin', async () => {
  vi.resetModules();
  vi.stubEnv('GUEST_ONLY', 'false');
  vi.stubEnv('DATABASE_URL', 'postgres://unused:unused@127.0.0.1:1/unused');
  vi.stubEnv('AUTH_ENABLED', 'true');
  vi.stubEnv('REGISTRATION_ENABLED', 'true');
  vi.stubEnv('CLOUD_SAVE_ENABLED', 'true');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SMTP_HOST', 'smtp.example.test');
  vi.stubEnv('SMTP_PORT', '587');
  vi.stubEnv('SMTP_SECURE', 'false');
  vi.stubEnv('SMTP_USER', 'game@example.test');
  vi.stubEnv('SMTP_PASS', 'local-test-only');
  vi.stubEnv('SMTP_FROM', 'Kitchen Rush <game@example.test>');
  vi.stubEnv('ACCOUNT_PUBLIC_URL', 'https://game.example.test');
  const database = await import('../apps/server/src/persistence/database');
  try {
    expect(database.registrationEnabled).toBe(true);
    expect(await database.databaseAvailable()).toBe(false);
  } finally {
    await database.pool?.end();
  }

  vi.resetModules();
  vi.stubEnv('ACCOUNT_PUBLIC_URL', 'auto');
  const quickTunnel = await import('../apps/server/src/persistence/database');
  try {
    expect(quickTunnel.registrationEnabled).toBe(true);
  } finally {
    await quickTunnel.pool?.end();
  }

  vi.resetModules();
  vi.stubEnv('ACCOUNT_PUBLIC_URL', 'http://game.example.test');
  const insecure = await import('../apps/server/src/persistence/database');
  try {
    expect(insecure.registrationEnabled).toBe(false);
  } finally {
    await insecure.pool?.end();
  }
});
