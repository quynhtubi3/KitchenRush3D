import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://kitchen:kitchen_local@localhost:5432/kitchen',
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(71032026)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const folder = new URL('./migrations/', import.meta.url);
  for (const name of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) {
    const exists = await client.query('SELECT 1 FROM schema_migration WHERE name=$1', [name]);
    if (!exists.rowCount) {
      await client.query(await readFile(fileURLToPath(new URL(name, folder)), 'utf8'));
      await client.query('INSERT INTO schema_migration(name) VALUES($1)', [name]);
      console.log(`Applied ${name}`);
    }
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
