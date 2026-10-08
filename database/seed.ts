import pg from 'pg';
import { recipes, levels, validateCampaign } from '../packages/content/src/campaign';
validateCampaign();
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://kitchen:kitchen_local@localhost:5432/kitchen',
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const [kind, data] of [
    ...recipes.map((data) => ['recipe', data] as const),
    ...levels.map((data) => ['level', data] as const),
  ])
    await client.query(
      'INSERT INTO content(id,kind,version,data) VALUES($1,$2,2,$3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,version=EXCLUDED.version,updated_at=now()',
      [data.id, kind, JSON.stringify(data)],
    );
  await client.query('COMMIT');
  console.log(`Seeded ${levels.length} levels and ${recipes.length} recipes (content version 2).`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
