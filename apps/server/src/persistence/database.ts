import pg from 'pg';
import { emailDeliveryConfigured } from './email';

const connectionString = process.env.DATABASE_URL;

/** Explicit rollout flags keep a configured database from silently changing Guest behavior. */
export const databaseConfigured = Boolean(connectionString) && process.env.GUEST_ONLY !== 'true';
export const authEnabled = databaseConfigured && process.env.AUTH_ENABLED === 'true';
export const cloudSaveEnabled = databaseConfigured && process.env.CLOUD_SAVE_ENABLED === 'true';
export const emailVerificationRequired = process.env.NODE_ENV === 'production';
export const registrationEnabled =
  authEnabled &&
  process.env.REGISTRATION_ENABLED === 'true' &&
  (!emailVerificationRequired || emailDeliveryConfigured);
export const accountsConfigured = databaseConfigured && (authEnabled || cloudSaveEnabled);
export const pool = accountsConfigured
  ? new pg.Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000,
      statement_timeout: 10_000,
      lock_timeout: 5_000,
      application_name: 'kitchen-rush-server',
    })
  : null;

// pg emits idle-client errors during a database outage; leaving the event
// unhandled would terminate the game server before the journal can retry.
pool?.on('error', (error: NodeJS.ErrnoException) => {
  console.error('Database idle connection lost', { code: error.code ?? 'connectionError' });
});

export async function databaseAvailable() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
