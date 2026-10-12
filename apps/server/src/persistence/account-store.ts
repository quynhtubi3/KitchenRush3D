import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { unlockedLevels, levels } from '../../../../packages/content/src/campaign';
import type { Result } from '../../../../packages/shared/src/types';
import { hashPassword, opaqueToken, tokenDigest, verifyPassword } from './credentials';
import { accountsConfigured, cloudSaveEnabled, pool } from './database';
import { normalizeDisplayName, normalizeEmail, validPassword } from './identity';

const SESSION_DAYS = 30;
const EMAIL_ACTION_TTL_MINUTES = 30;
const EMAIL_ACTION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const USERNAME = /^[a-zA-Z0-9_]{3,24}$/;
const GUEST_TOKEN = /^[\w-]{32,128}$/;

export type Account = {
  id: string;
  displayName: string;
  playerCode: string;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  isGuest: boolean;
  createdAt: string;
  lastPlayedAt: string | null;
  defaultChefAppearance: Record<string, unknown>;
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
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    await lockIdentityWrites(client);
    const identity = await client.query(
      'SELECT COALESCE(merged_into,id) AS id FROM player_profile WHERE id=$1',
      [playerId],
    );
    if (!identity.rowCount) throw new Error('unknownParticipant');
    await client.query(
      `INSERT INTO legacy_progress_import(player_id,source_id,payload) VALUES($1,$2,$3::jsonb)
       ON CONFLICT(player_id,source_id) DO NOTHING`,
      [identity.rows[0].id, tokenDigest(sourceToken), JSON.stringify(legacy)],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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

async function createEmailAction(
  client: PoolClient,
  playerId: string,
  purpose: 'verifyEmail' | 'resetPassword',
) {
  await client.query(
    `DELETE FROM account_email_action
     WHERE created_at < now() - interval '7 days' OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '1 day')`,
  );
  const recent = await client.query(
    `SELECT 1 FROM account_email_action
     WHERE player_id=$1 AND purpose=$2 AND consumed_at IS NULL
       AND created_at > now() - interval '60 seconds' LIMIT 1`,
    [playerId, purpose],
  );
  if (recent.rowCount) return null;
  await client.query(
    `UPDATE account_email_action SET consumed_at=now()
     WHERE player_id=$1 AND purpose=$2 AND consumed_at IS NULL`,
    [playerId, purpose],
  );
  const token = opaqueToken(32);
  await client.query(
    `INSERT INTO account_email_action(token_hash,player_id,purpose,expires_at)
     VALUES($1,$2,$3,now() + ($4 * interval '1 minute'))`,
    [tokenDigest(token), playerId, purpose, EMAIL_ACTION_TTL_MINUTES],
  );
  return token;
}

function account(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    playerCode: String(row.player_code),
    email: row.email == null ? null : String(row.email),
    emailVerified: Boolean(row.email_verified_at),
    username: row.username == null ? null : String(row.username),
    isGuest: Boolean(row.is_guest),
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastPlayedAt:
      row.last_played_at == null ? null : new Date(String(row.last_played_at)).toISOString(),
    defaultChefAppearance:
      row.default_chef_appearance && typeof row.default_chef_appearance === 'object'
        ? (row.default_chef_appearance as Record<string, unknown>)
        : { variant: 'classic' },
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
      'SELECT id, display_name, player_code, email, email_verified_at, username, is_guest, merged_into, created_at, last_played_at, default_chef_appearance FROM player_profile WHERE guest_token_hash=$1 FOR UPDATE',
      [digest],
    );
    if (!found.rowCount) {
      let created;
      for (let attempt = 0; attempt < 4; attempt++) {
        created = await client.query(
          `INSERT INTO player_profile(id, display_name, player_code, guest_token_hash, is_guest)
             VALUES($1, $2, $3, $4, true)
             ON CONFLICT DO NOTHING
             RETURNING id, display_name, player_code, email, email_verified_at, username, is_guest, created_at, last_played_at, default_chef_appearance`,
          [
            randomUUID(),
            `Guest ${opaqueToken(3).slice(0, 5)}`,
            `KR-${opaqueToken(6).slice(0, 10).toUpperCase()}`,
            digest,
          ],
        );
        if (created.rowCount) break;
        found = await client.query(
          'SELECT id, display_name, player_code, email, email_verified_at, username, is_guest, merged_into, created_at, last_played_at, default_chef_appearance FROM player_profile WHERE guest_token_hash=$1 FOR UPDATE',
          [digest],
        );
        if (found.rowCount) break;
      }
      found = created?.rowCount ? created : found;
    }
    const row = found.rows[0];
    if (!row) throw new Error('guestCreationFailed');
    const principal = account(row);
    if (!principal.isGuest || row.merged_into) throw new Error('guestTokenUsed');
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

export async function register(
  emailAddress: string,
  password: string,
  displayName: string,
  guestToken?: string,
  legacyProgress?: unknown,
) {
  const email = normalizeEmail(emailAddress);
  const name = normalizeDisplayName(displayName);
  if (!email) throw new Error('invalidEmail');
  if (!name) throw new Error('invalidDisplayName');
  if (!validPassword(password)) throw new Error('invalidPassword');
  if (guestToken !== undefined && !validGuestToken(guestToken))
    throw new Error('invalidGuestToken');
  const db = requirePool();
  const passwordHash = await hashPassword(password);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await lockIdentityWrites(client);
    let row;
    if (guestToken) {
      const guest = await client.query(
        `SELECT id,merged_into FROM player_profile
         WHERE guest_token_hash=$1 AND is_guest FOR UPDATE`,
        [tokenDigest(guestToken)],
      );
      if (guest.rowCount) {
        if (guest.rows[0].merged_into) throw new Error('guestTokenUsed');
        row = await client.query(
          `UPDATE player_profile
           SET username=NULL, email=$2, email_verified_at=now(), display_name=$3, password_hash=$4, guest_token_hash=NULL, is_guest=false
           WHERE id=$1
           RETURNING id, display_name, player_code, email, email_verified_at, username, is_guest, created_at, last_played_at, default_chef_appearance`,
          [guest.rows[0].id, email, name, passwordHash],
        );
      }
    }
    if (!row?.rowCount)
      row = await client.query(
        `INSERT INTO player_profile(id,display_name,email,email_verified_at,password_hash,player_code,is_guest)
         VALUES($1,$2,$3,now(),$4,$5,false)
         RETURNING id,display_name,player_code,email,email_verified_at,username,is_guest,created_at,last_played_at,default_chef_appearance`,
        [
          randomUUID(),
          name,
          email,
          passwordHash,
          `KR-${opaqueToken(6).slice(0, 10).toUpperCase()}`,
        ],
      );
    const created = account(row.rows[0]);
    const legacy = guestToken ? normalizeLegacy(legacyProgress) : {};
    if (Object.keys(legacy).length)
      await client.query(
        `INSERT INTO legacy_progress_import(player_id,source_id,payload)
         VALUES($1,$2,$3::jsonb) ON CONFLICT(player_id,source_id) DO NOTHING`,
        [created.id, tokenDigest(guestToken!), JSON.stringify(legacy)],
      );
    // Guest sessions must not become authenticated account sessions after upgrade.
    await client.query('DELETE FROM player_session WHERE player_id=$1', [created.id]);
    const session = await insertSession(client, created.id);
    await client.query('COMMIT');
    return { account: created, ...session };
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') throw new Error('emailTaken');
    throw error;
  } finally {
    client.release();
  }
}

/** Create an account that cannot authenticate until its emailed link is consumed. */
export async function registerPendingEmail(
  emailAddress: string,
  password: string,
  displayName: string,
  guestToken?: string,
  legacyProgress?: unknown,
) {
  const email = normalizeEmail(emailAddress);
  const name = normalizeDisplayName(displayName);
  if (!email) throw new Error('invalidEmail');
  if (!name) throw new Error('invalidDisplayName');
  if (!validPassword(password)) throw new Error('invalidPassword');
  if (guestToken !== undefined && !validGuestToken(guestToken))
    throw new Error('invalidGuestToken');
  const passwordHash = await hashPassword(password);
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    await lockIdentityWrites(client);
    const inserted = await client.query(
      `INSERT INTO player_profile(id,display_name,email,password_hash,player_code,is_guest)
       VALUES($1,$2,$3,$4,$5,false)
       ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING
       RETURNING id,email,email_verified_at`,
      [randomUUID(), name, email, passwordHash, `KR-${opaqueToken(6).slice(0, 10).toUpperCase()}`],
    );
    let playerId = inserted.rows[0]?.id as string | undefined;
    if (!playerId) {
      const existing = await client.query(
        `SELECT id,email_verified_at FROM player_profile
         WHERE lower(email)=lower($1) AND NOT is_guest FOR UPDATE`,
        [email],
      );
      if (existing.rowCount && existing.rows[0].email_verified_at == null)
        playerId = existing.rows[0].id as string;
    }

    let token: string | null = null;
    if (playerId) {
      if (inserted.rowCount && guestToken) {
        const legacy = normalizeLegacy(legacyProgress);
        if (Object.keys(legacy).length)
          await client.query(
            `INSERT INTO legacy_progress_import(player_id,source_id,payload)
             VALUES($1,$2,$3::jsonb) ON CONFLICT(player_id,source_id) DO NOTHING`,
            [playerId, tokenDigest(guestToken), JSON.stringify(legacy)],
          );
      }
      token = await createEmailAction(client, playerId, 'verifyEmail');
    }
    await client.query('COMMIT');
    return { email: token ? email : null, token };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function requestEmailAction(
  emailAddress: unknown,
  purpose: 'verifyEmail' | 'resetPassword',
) {
  const email = normalizeEmail(emailAddress);
  if (!email) return null;
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    const requirement =
      purpose === 'verifyEmail' ? 'email_verified_at IS NULL' : 'email_verified_at IS NOT NULL';
    const found = await client.query(
      `SELECT id,email FROM player_profile
       WHERE lower(email)=lower($1) AND NOT is_guest AND ${requirement}
       FOR UPDATE`,
      [email],
    );
    let token: string | null = null;
    if (found.rowCount)
      token = await createEmailAction(client, found.rows[0].id as string, purpose);
    await client.query('COMMIT');
    return token && found.rowCount ? { email: found.rows[0].email as string, token } : null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function mergeGuestProgress(client: PoolClient, targetId: string, guestToken: string) {
  const guest = await client.query(
    'SELECT id FROM player_profile WHERE guest_token_hash=$1 AND is_guest AND merged_into IS NULL FOR UPDATE',
    [tokenDigest(guestToken)],
  );
  if (!guest.rowCount || guest.rows[0].id === targetId) return;
  const guestId = guest.rows[0].id as string;
  await client.query(
    `INSERT INTO player_level_progress(player_id,restaurant_id,level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service,updated_at)
     SELECT $1,restaurant_id,level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service,updated_at
     FROM player_level_progress WHERE player_id=$2
     ON CONFLICT(player_id,level_id) DO UPDATE SET
       restaurant_id=EXCLUDED.restaurant_id,
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
  // In-flight rooms and the durable retry queue may still refer to guestId.
  // Keep a non-authenticating alias; never grant an old Guest session access
  // to the destination account. The old token also cannot mint a new session.
  await client.query('DELETE FROM player_session WHERE player_id=$1', [guestId]);
  await client.query('DELETE FROM player_level_progress WHERE player_id=$1', [guestId]);
  await client.query('DELETE FROM match_participant WHERE player_id=$1', [guestId]);
  await client.query('DELETE FROM legacy_progress_import WHERE player_id=$1', [guestId]);
  await client.query('UPDATE player_profile SET merged_into=$2 WHERE id=$1', [guestId, targetId]);
}

export async function verifyEmailAction(rawToken: unknown, guestToken?: string) {
  if (typeof rawToken !== 'string' || !EMAIL_ACTION_TOKEN.test(rawToken))
    throw new Error('invalidActionToken');
  if (guestToken !== undefined && !validGuestToken(guestToken))
    throw new Error('invalidGuestToken');
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    await lockIdentityWrites(client);
    const action = await client.query(
      `SELECT a.player_id,p.email_verified_at
       FROM account_email_action a JOIN player_profile p ON p.id=a.player_id
       WHERE a.token_hash=$1 AND a.purpose='verifyEmail' AND a.consumed_at IS NULL
         AND a.expires_at>now() FOR UPDATE OF a,p`,
      [tokenDigest(rawToken)],
    );
    if (!action.rowCount || action.rows[0].email_verified_at != null)
      throw new Error('invalidActionToken');
    const playerId = action.rows[0].player_id as string;
    const updated = await client.query(
      `UPDATE player_profile SET email_verified_at=now()
       WHERE id=$1 AND NOT is_guest
       RETURNING id,display_name,player_code,email,email_verified_at,username,is_guest,created_at,last_played_at,default_chef_appearance`,
      [playerId],
    );
    if (!updated.rowCount) throw new Error('invalidActionToken');
    await client.query(
      `UPDATE account_email_action SET consumed_at=now()
       WHERE player_id=$1 AND purpose='verifyEmail' AND consumed_at IS NULL`,
      [playerId],
    );
    if (guestToken) await mergeGuestProgress(client, playerId, guestToken);
    const session = await insertSession(client, playerId);
    await client.query('COMMIT');
    return { account: account(updated.rows[0]), ...session };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function resetPasswordWithAction(rawToken: unknown, nextPassword: string) {
  if (typeof rawToken !== 'string' || !EMAIL_ACTION_TOKEN.test(rawToken))
    throw new Error('invalidActionToken');
  if (!validPassword(nextPassword)) throw new Error('invalidPassword');
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    await lockIdentityWrites(client);
    const action = await client.query(
      `SELECT a.player_id
       FROM account_email_action a JOIN player_profile p ON p.id=a.player_id
       WHERE a.token_hash=$1 AND a.purpose='resetPassword' AND a.consumed_at IS NULL
         AND a.expires_at>now() AND p.email_verified_at IS NOT NULL
       FOR UPDATE OF a,p`,
      [tokenDigest(rawToken)],
    );
    if (!action.rowCount) throw new Error('invalidActionToken');
    const playerId = action.rows[0].player_id as string;
    const passwordHash = await hashPassword(nextPassword);
    await client.query('UPDATE player_profile SET password_hash=$2 WHERE id=$1', [
      playerId,
      passwordHash,
    ]);
    await client.query(
      `UPDATE account_email_action SET consumed_at=now()
       WHERE player_id=$1 AND purpose='resetPassword' AND consumed_at IS NULL`,
      [playerId],
    );
    await client.query('DELETE FROM player_session WHERE player_id=$1', [playerId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function login(
  identifier: string,
  password: string,
  guestToken?: string,
  legacyProgress?: unknown,
) {
  const email = normalizeEmail(identifier);
  const legacyUsername = USERNAME.test(identifier) ? identifier : null;
  if ((!email && !legacyUsername) || !password || password.length > 128)
    throw new Error('invalidCredentials');
  if (guestToken !== undefined && !validGuestToken(guestToken))
    throw new Error('invalidGuestToken');
  const db = requirePool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await lockIdentityWrites(client);
    const found = await client.query(
      `SELECT id,display_name,player_code,email,email_verified_at,username,password_hash,is_guest,created_at,last_played_at,default_chef_appearance
       FROM player_profile
       WHERE NOT is_guest AND (email IS NULL OR email_verified_at IS NOT NULL)
         AND (($1::text IS NOT NULL AND lower(email)=lower($1)) OR ($2::text IS NOT NULL AND lower(username)=lower($2)))
       FOR UPDATE`,
      [email, legacyUsername],
    );
    if (!found.rowCount || !(await verifyPassword(password, found.rows[0].password_hash)))
      throw new Error('invalidCredentials');
    const signedIn = account(found.rows[0]);
    if (guestToken) await mergeGuestProgress(client, signedIn.id, guestToken);
    const legacy = guestToken ? normalizeLegacy(legacyProgress) : {};
    if (Object.keys(legacy).length)
      await client.query(
        `INSERT INTO legacy_progress_import(player_id,source_id,payload)
         VALUES($1,$2,$3::jsonb) ON CONFLICT(player_id,source_id) DO NOTHING`,
        [signedIn.id, tokenDigest(guestToken!), JSON.stringify(legacy)],
      );
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
    `SELECT p.id,p.display_name,p.player_code,p.email,p.email_verified_at,p.username,p.is_guest,p.created_at,p.last_played_at,p.default_chef_appearance,s.token_hash
     FROM player_session s JOIN player_profile p ON p.id=s.player_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND p.merged_into IS NULL`,
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

export async function changePassword(
  playerId: string,
  currentSessionHash: string,
  currentPassword: string,
  nextPassword: string,
) {
  if (!validPassword(nextPassword)) throw new Error('invalidPassword');
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT p.password_hash,p.is_guest FROM player_profile p
       JOIN player_session s ON s.player_id=p.id
       WHERE p.id=$1 AND s.token_hash=$2 AND s.expires_at>now() FOR UPDATE OF p`,
      [playerId, currentSessionHash],
    );
    if (!found.rowCount || found.rows[0].is_guest) throw new Error('notAuthenticated');
    if (!(await verifyPassword(currentPassword, found.rows[0].password_hash)))
      throw new Error('invalidCredentials');
    const nextHash = await hashPassword(nextPassword);
    await client.query('UPDATE player_profile SET password_hash=$2 WHERE id=$1', [
      playerId,
      nextHash,
    ]);
    await client.query('DELETE FROM player_session WHERE player_id=$1 AND token_hash<>$2', [
      playerId,
      currentSessionHash,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeSession(sessionHash: string) {
  await requirePool().query('DELETE FROM player_session WHERE token_hash=$1', [sessionHash]);
}

export async function loadProgress(playerId: string, matchId?: string) {
  const db = requirePool();
  const result = await db.query(
    `SELECT restaurant_id,level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service,updated_at
     FROM player_level_progress WHERE player_id=$1 ORDER BY level_id`,
    [playerId],
  );
  const records = result.rows.map((r) => ({
    levelId: r.level_id as string,
    restaurantId: r.restaurant_id as string,
    completed: Boolean(r.completed),
    wins: Number(r.wins),
    bestScore: Number(r.best_score),
    bestStars: Number(r.best_stars),
    bestServed: Number(r.best_served),
    bestMissed: Number(r.best_missed),
    bestCombo: Number(r.best_combo),
    bestAverageService: Number(r.best_average_service),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
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

export async function touchLastPlayed(playerId: string) {
  if (!pool) return;
  await pool.query(
    'UPDATE player_profile SET last_played_at=now() WHERE id=$1 AND merged_into IS NULL',
    [playerId],
  );
}

// Serialize merge/finalization before taking profile locks. A shared lock order
// prevents lost progress and deadlocks when a live Guest is merged mid-match.
async function lockIdentityWrites(client: PoolClient) {
  await client.query('SELECT pg_advisory_xact_lock(71032027)');
}

export async function persistMatch(result: Result, participants: string[]) {
  if (!cloudSaveEnabled || !pool || participants.length === 0) return;
  const campaignLevel = levels.find((level) => level.id === result.levelId);
  if (!campaignLevel) throw new Error('unknownLevel');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockIdentityWrites(client);
    const saved = await client.query(
      `INSERT INTO match_result(id,level_id,team_size,result,completed_at)
       VALUES($1,$2,$3,$4::jsonb,now()) ON CONFLICT(id) DO NOTHING RETURNING id`,
      [result.matchId, result.levelId, result.teamSize ?? 1, JSON.stringify(result)],
    );
    if (!saved.rowCount) {
      await client.query('COMMIT');
      return;
    }
    const identities = await client.query(
      'SELECT id,COALESCE(merged_into,id) AS canonical_id FROM player_profile WHERE id=ANY($1::uuid[])',
      [[...new Set(participants)]],
    );
    if (identities.rowCount !== new Set(participants).size) throw new Error('unknownParticipant');
    for (const playerId of new Set<string>(identities.rows.map((row) => row.canonical_id))) {
      const linked = await client.query(
        'INSERT INTO match_participant(match_id,player_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING player_id',
        [result.matchId, playerId],
      );
      if (!linked.rowCount) continue;
      await client.query(
        `INSERT INTO player_level_progress(player_id,restaurant_id,level_id,completed,wins,best_score,best_stars,best_served,best_missed,best_combo,best_average_service)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(player_id,level_id) DO UPDATE SET
           restaurant_id=EXCLUDED.restaurant_id,
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
          campaignLevel.restaurantId,
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
