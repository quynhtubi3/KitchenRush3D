import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { unlockedLevels, levels } from '../../../../packages/content/src/campaign';
import type { Result } from '../../../../packages/shared/src/types';
import { hashPassword, opaqueToken, tokenDigest, verifyPassword } from './credentials';
import { accountsConfigured, pool } from './database';

const SESSION_DAYS = 30;
const USERNAME = /^[a-zA-Z0-9_]{3,24}$/;
const GUEST_TOKEN = /^[\w-]{32,128}$/;

export type Account = {
  id: string;
  displayName: string;
  playerCode: string;
  username: string | null;
  isGuest: boolean;
};

export type Principal = Account & { sessionHash: string };

function requirePool() {
  if (!pool) throw new Error('accountsUnavailable');
  return pool;
}

export function validGuestToken(value: unknown): value is string {
  return typeof value === 'string' && GUEST_TOKEN.test(value);
}

function normalizeLegacyResult(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.levelId !== 'string' ||
    !levels.some((l) => l.id === candidate.levelId) ||
    typeof candidate.score !== 'number' ||
    !Number.isFinite(candidate.score) ||
    typeof candidate.stars !== 'number' ||
    !Number.isInteger(candidate.stars) ||
    candidate.stars < 0 ||
    candidate.stars > 3 ||
    typeof candidate.won !== 'boolean'
  )
    return null;
  return {
    levelId: candidate.levelId,
    score: Math.max(0, Math.floor(candidate.score)),
    stars: candidate.stars,
    won: candidate.won,
  };
}

function normalizeLegacy(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const wins = Array.isArray(input.wins)
    ? [
        ...new Set(
          input.wins.filter(
            (id): id is string => typeof id === 'string' && levels.some((l) => l.id === id),
          ),
        ),
      ].slice(0, 50)
    : [];
  const stars: Record<string, number> = {};
  if (input.stars && typeof input.stars === 'object' && !Array.isArray(input.stars)) {
    for (const [id, value] of Object.entries(input.stars as Record<string, unknown>))
      if (
        levels.some((l) => l.id === id) &&
        Number.isInteger(value) &&
        Number(value) >= 0 &&
        Number(value) <= 3
      )
        stars[id] = Number(value);
  }
  const best = normalizeLegacyResult(input.best);
  const last = normalizeLegacyResult(input.last);
  const teams: Record<string, NonNullable<ReturnType<typeof normalizeLegacyResult>>> = {};
  if (input.teams && typeof input.teams === 'object' && !Array.isArray(input.teams)) {
    for (const [size, result] of Object.entries(input.teams as Record<string, unknown>))
      if (['2', '3', '4'].includes(size)) {
        const safe = normalizeLegacyResult(result);
        if (safe) teams[size] = safe;
      }
  }
  if (
    wins.length === 0 &&
    Object.keys(stars).length === 0 &&
    !best &&
    !last &&
    Object.keys(teams).length === 0
  )
    return {};
  return { wins, stars, best, last, teams };
}

export async function archiveLegacyProgress(
  playerId: string,
  value: unknown,
  sourceToken: unknown,
) {
  if (!validGuestToken(sourceToken)) throw new Error('invalidGuestToken');
  const legacy = normalizeLegacy(value);
  if (!Object.keys(legacy).length) return;
  await requirePool().query(
    `INSERT INTO legacy_progress_import(player_id,source_id,payload) VALUES($1,$2,$3::jsonb)
     ON CONFLICT(player_id,source_id) DO NOTHING`,
    [playerId, tokenDigest(sourceToken), JSON.stringify(legacy)],
  );
}

async function insertSession(client: PoolClient, playerId: string) {
  const token = opaqueToken();
  const digest = tokenDigest(token);
  await client.query(
    `INSERT INTO player_session(token_hash, player_id, expires_at)
     VALUES($1, $2, now() + ($3 * interval '1 day'))`,
    [digest, playerId, SESSION_DAYS],
  );
  return { token, digest };
}

function account(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    playerCode: String(row.player_code),
    username: row.username == null ? null : String(row.username),
    isGuest: Boolean(row.is_guest),
  };
}

export async function ensureGuest(guestToken: string, legacyProgress?: unknown) {
  if (!validGuestToken(guestToken)) throw new Error('invalidGuestToken');
  const db = requirePool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const digest = tokenDigest(guestToken);
    let found = await client.query(
      'SELECT id, display_name, player_code, username, is_guest FROM player_profile WHERE guest_token_hash=$1 FOR UPDATE',
      [digest],
    );
    if (!found.rowCount) {
      let created;
      for (let attempt = 0; attempt < 4; attempt++) {
        created = await client.query(
          `INSERT INTO player_profile(id, display_name, player_code, guest_token_hash, is_guest)
             VALUES($1, $2, $3, $4, true)
             ON CONFLICT DO NOTHING
             RETURNING id, display_name, player_code, username, is_guest`,
          [
            randomUUID(),
            `Guest ${opaqueToken(3).slice(0, 5)}`,
            `KR-${opaqueToken(6).slice(0, 10).toUpperCase()}`,
            digest,
          ],
        );
        if (created.rowCount) break;
        found = await client.query(
          'SELECT id, display_name, player_code, username, is_guest FROM player_profile WHERE guest_token_hash=$1 FOR UPDATE',
          [digest],
        );
        if (found.rowCount) break;
      }
      found = created?.rowCount ? created : found;
    }
    const row = found.rows[0];
    if (!row) throw new Error('guestCreationFailed');
    const principal = account(row);
    if (!principal.isGuest) throw new Error('guestTokenUsed');
    const legacy = normalizeLegacy(legacyProgress);
    if (Object.keys(legacy).length)
      await client.query(
        `INSERT INTO legacy_progress_import(player_id,source_id,payload)
         VALUES($1,$2,$3::jsonb) ON CONFLICT(player_id,source_id) DO NOTHING`,
        [principal.id, digest, JSON.stringify(legacy)],
      );
    const session = await insertSession(client, principal.id);
    await client.query('COMMIT');
    return { account: principal, ...session };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function register(username: string, password: string, guestToken?: string) {
  if (!USERNAME.test(username)) throw new Error('invalidUsername');
  if (password.length < 10 || password.length > 128) throw new Error('invalidPassword');
  if (guestToken !== undefined && !validGuestToken(guestToken))
    throw new Error('invalidGuestToken');
  const db = requirePool();
  const passwordHash = await hashPassword(password);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let row;
    if (guestToken) {
      const guest = await client.query(
        `SELECT id FROM player_profile
         WHERE guest_token_hash=$1 AND is_guest FOR UPDATE`,
        [tokenDigest(guestToken)],
      );
      if (guest.rowCount) {
        row = await client.query(
          `UPDATE player_profile
           SET username=$2, display_name=$2, password_hash=$3, guest_token_hash=NULL, is_guest=false
           WHERE id=$1
           RETURNING id, display_name, player_code, username, is_guest`,
          [guest.rows[0].id, username, passwordHash],
        );
      }
    }
    if (!row?.rowCount)
      row = await client.query(
        `INSERT INTO player_profile(id,display_name,username,password_hash,player_code,is_guest)
         VALUES($1,$2,$2,$3,$4,false)
         RETURNING id,display_name,player_code,username,is_guest`,
        [randomUUID(), username, passwordHash, `KR-${opaqueToken(6).slice(0, 10).toUpperCase()}`],
      );
    const created = account(row.rows[0]);
    // Guest sessions must not become authenticated account sessions after upgrade.
    await client.query('DELETE FROM player_session WHERE player_id=$1', [created.id]);
    const session = await insertSession(client, created.id);
    await client.query('COMMIT');
    return { account: created, ...session };
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') throw new Error('usernameTaken');
    throw error;
  } finally {
    client.release();
  }
}

async function mergeGuestProgress(client: PoolClient, targetId: string, guestToken: string) {
  const guest = await client.query(
    'SELECT id FROM player_profile WHERE guest_token_hash=$1 AND is_guest FOR UPDATE',
    [tokenDigest(guestToken)],
  );
  if (!guest.rowCount || guest.rows[0].id === targetId) return;
  const guestId = guest.rows[0].id as string;
  await client.query(
    `INSERT INTO player_level_progress(player_id,level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service,updated_at)
     SELECT $1,level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service,updated_at
     FROM player_level_progress WHERE player_id=$2
     ON CONFLICT(player_id,level_id) DO UPDATE SET
       completed=player_level_progress.completed OR EXCLUDED.completed,
       wins=player_level_progress.wins+EXCLUDED.wins,
       best_score=GREATEST(player_level_progress.best_score,EXCLUDED.best_score),
       best_stars=GREATEST(player_level_progress.best_stars,EXCLUDED.best_stars),
       best_served=GREATEST(player_level_progress.best_served,EXCLUDED.best_served),
       best_combo=GREATEST(player_level_progress.best_combo,EXCLUDED.best_combo),
       best_missed=LEAST(player_level_progress.best_missed,EXCLUDED.best_missed),
       best_average_service=LEAST(NULLIF(player_level_progress.best_average_service,0),EXCLUDED.best_average_service),
       updated_at=now()`,
    [targetId, guestId],
  );
  await client.query(
    `INSERT INTO match_participant(match_id,player_id,created_at)
     SELECT match_id,$1,created_at FROM match_participant WHERE player_id=$2
     ON CONFLICT(match_id,player_id) DO NOTHING`,
    [targetId, guestId],
  );
  await client.query(
    `INSERT INTO legacy_progress_import(player_id,source_id,payload)
     SELECT $1,source_id,payload FROM legacy_progress_import WHERE player_id=$2
     ON CONFLICT(player_id,source_id) DO NOTHING`,
    [targetId, guestId],
  );
  await client.query(
    `INSERT INTO currency_ledger(player_id,idempotency_key,amount,reason,created_at)
     SELECT $1,idempotency_key,amount,reason,created_at FROM currency_ledger WHERE player_id=$2
     ON CONFLICT(player_id,idempotency_key) DO NOTHING`,
    [targetId, guestId],
  );
  await client.query('DELETE FROM currency_ledger WHERE player_id=$1', [guestId]);
  // Both identities may have participated in the same match. Count each win once.
  await client.query(
    `UPDATE player_level_progress p SET wins=(
       SELECT count(*) FROM match_participant mp JOIN match_result m ON m.id=mp.match_id
       WHERE mp.player_id=$1 AND m.level_id=p.level_id AND (m.result->>'won')::boolean
     ) WHERE p.player_id=$1`,
    [targetId],
  );
  await client.query('DELETE FROM player_profile WHERE id=$1', [guestId]);
}

export async function login(username: string, password: string, guestToken?: string) {
  if (!USERNAME.test(username) || password.length > 128) throw new Error('invalidCredentials');
  if (guestToken !== undefined && !validGuestToken(guestToken))
    throw new Error('invalidGuestToken');
  const db = requirePool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id,display_name,player_code,username,password_hash,is_guest
       FROM player_profile WHERE lower(username)=lower($1) AND NOT is_guest FOR UPDATE`,
      [username],
    );
    if (!found.rowCount || !(await verifyPassword(password, found.rows[0].password_hash)))
      throw new Error('invalidCredentials');
    const signedIn = account(found.rows[0]);
    if (guestToken) await mergeGuestProgress(client, signedIn.id, guestToken);
    const session = await insertSession(client, signedIn.id);
    await client.query('COMMIT');
    return { account: signedIn, ...session };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticate(rawToken: string | undefined): Promise<Principal | null> {
  if (!rawToken || rawToken.length > 128 || !pool) return null;
  const result = await pool.query(
    `SELECT p.id,p.display_name,p.player_code,p.username,p.is_guest,s.token_hash
     FROM player_session s JOIN player_profile p ON p.id=s.player_id
     WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [tokenDigest(rawToken)],
  );
  if (!result.rowCount) return null;
  void pool
    .query('UPDATE player_session SET last_seen_at=now() WHERE token_hash=$1', [
      tokenDigest(rawToken),
    ])
    .catch(() => undefined);
  return { ...account(result.rows[0]), sessionHash: result.rows[0].token_hash as string };
}

export async function revokeSession(sessionHash: string) {
  await requirePool().query('DELETE FROM player_session WHERE token_hash=$1', [sessionHash]);
}

export async function loadProgress(playerId: string, matchId?: string) {
  const db = requirePool();
  const result = await db.query(
    `SELECT level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service
     FROM player_level_progress WHERE player_id=$1 ORDER BY level_id`,
    [playerId],
  );
  const records = result.rows.map((r) => ({
    levelId: r.level_id as string,
    completed: Boolean(r.completed),
    wins: Number(r.wins),
    bestScore: Number(r.best_score),
    bestStars: Number(r.best_stars),
    bestServed: Number(r.best_served),
    bestMissed: Number(r.best_missed),
    bestCombo: Number(r.best_combo),
    bestAverageService: Number(r.best_average_service),
  }));
  const wins = records.filter((r) => r.completed).map((r) => r.levelId);
  const unlocked = unlockedLevels(wins).map((l) => l.id);
  const legacy = await db.query(
    'SELECT payload FROM legacy_progress_import WHERE player_id=$1 ORDER BY imported_at',
    [playerId],
  );
  const match = matchId
    ? await db.query('SELECT match_id FROM match_participant WHERE player_id=$1 AND match_id=$2', [
        playerId,
        matchId,
      ])
    : null;
  return {
    persistedMatchId: match?.rows[0]?.match_id ?? null,
    wins: records.filter((r) => r.completed).map((r) => r.levelId),
    unlocked,
    levels: records,
    legacyProgress:
      legacy.rows.length === 0
        ? null
        : legacy.rows.length === 1
          ? legacy.rows[0].payload
          : { imports: legacy.rows.map((row) => row.payload) },
    legacyProgressIsUnverified: Boolean(legacy.rowCount),
  };
}

export async function canPlayLevel(playerId: string, levelId: string) {
  const progress = await loadProgress(playerId);
  return progress.unlocked.includes(levelId);
}

export async function persistMatch(result: Result, participants: string[]) {
  if (!pool || participants.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = await client.query(
      `INSERT INTO match_result(id,level_id,team_size,result,completed_at)
       VALUES($1,$2,$3,$4::jsonb,now()) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [result.matchId, result.levelId, result.teamSize ?? 1, JSON.stringify(result)],
    );
    if (!saved.rowCount) {
      await client.query('COMMIT');
      return;
    }
    for (const playerId of new Set(participants)) {
      const linked = await client.query(
        'INSERT INTO match_participant(match_id,player_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING player_id',
        [result.matchId, playerId],
      );
      if (!linked.rowCount) continue;
      await client.query(
        `INSERT INTO player_level_progress(player_id,level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(player_id,level_id) DO UPDATE SET
           completed=player_level_progress.completed OR EXCLUDED.completed,
           wins=player_level_progress.wins+EXCLUDED.wins,
           best_score=GREATEST(player_level_progress.best_score,EXCLUDED.best_score),
           best_stars=GREATEST(player_level_progress.best_stars,EXCLUDED.best_stars),
           best_served=GREATEST(player_level_progress.best_served,EXCLUDED.best_served),
           best_missed=LEAST(player_level_progress.best_missed,EXCLUDED.best_missed),
           best_combo=GREATEST(player_level_progress.best_combo,EXCLUDED.best_combo),
           best_average_service=CASE WHEN player_level_progress.best_average_service=0 THEN EXCLUDED.best_average_service ELSE LEAST(player_level_progress.best_average_service,EXCLUDED.best_average_service) END,
           updated_at=now()`,
        [
          playerId,
          result.levelId,
          result.won,
          result.won ? 1 : 0,
          result.score,
          result.won ? result.stars : 0,
          result.served,
          result.missed,
          result.bestCombo,
          result.averageService,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { accountsConfigured };
