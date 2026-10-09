import pg from 'pg';

const connectionString = process.env.DATABASE_URL;

/** A missing database keeps the existing local game playable, but never enables fake persistence. */
export const accountsConfigured = process.env.GUEST_ONLY !== 'true' && Boolean(connectionString);
export const pool = accountsConfigured
  ? new pg.Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000,
      application_name: 'kitchen-rush-server',
    })
  : null;

export async function databaseAvailable() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
