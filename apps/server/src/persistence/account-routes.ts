import { Router, type Request, type Response } from 'express';
import {
  authenticate,
  archiveLegacyProgress,
  ensureGuest,
  loadProgress,
  login,
  register,
  revokeSession,
  validGuestToken,
} from './account-store';
import { accountsConfigured, databaseAvailable } from './database';

const COOKIE = 'kr_session';
const DAY_SECONDS = 60 * 60 * 24;
const attempts = new Map<string, { window: number; count: number }>();

function tokenFrom(req: Request) {
  const cookie = req.headers.cookie ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === COOKIE) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function principalFromCookie(cookieHeader: string | string[] | undefined) {
  const cookie = Array.isArray(cookieHeader) ? cookieHeader.join(';') : (cookieHeader ?? '');
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === COOKIE) return authenticate(decodeURIComponent(value.join('=')));
  }
  return Promise.resolve(null);
}

function safePrincipal(current: Awaited<ReturnType<typeof authenticate>>) {
  if (!current) return null;
  const { sessionHash: _sessionHash, ...publicAccount } = current;
  return publicAccount;
}

function setSession(req: Request, res: Response, token: string) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAY_SECONDS * 30}${secure}`,
  );
}

function clearSession(req: Request, res: Response) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function limited(req: Request) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  let entry = attempts.get(key);
  if (!entry || now - entry.window >= 60_000) {
    entry = { window: now, count: 0 };
    attempts.set(key, entry);
  }
  entry.count++;
  if (attempts.size > 2048)
    for (const [ip, value] of attempts) if (now - value.window > 120_000) attempts.delete(ip);
  return entry.count <= 12;
}

function fail(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'requestFailed';
  const statuses: Record<string, number> = {
    invalidUsername: 400,
    invalidPassword: 400,
    invalidGuestToken: 400,
    invalidCredentials: 401,
    rateLimited: 429,
    usernameTaken: 409,
    guestTokenUsed: 409,
    accountsUnavailable: 503,
    guestCreationFailed: 503,
  };
  if (
    (error as { code?: string }) &&
    ['23505', '23514'].includes((error as { code?: string }).code ?? '')
  )
    return res.status(409).json({ error: 'usernameTaken' });
  return res
    .status(statuses[code] ?? 503)
    .json({ error: statuses[code] ? code : 'serviceUnavailable' });
}

export const accountRoutes = Router();
accountRoutes.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

accountRoutes.get('/status', async (_req, res) => {
  const available = accountsConfigured && (await databaseAvailable());
  res.json({ accountsConfigured, accountsAvailable: available });
});

accountRoutes.post('/guest', async (req, res) => {
  if (!accountsConfigured) return res.status(503).json({ error: 'accountsUnavailable' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  if (!validGuestToken(req.body?.guestToken))
    return res.status(400).json({ error: 'invalidGuestToken' });
  try {
    const current = await authenticate(tokenFrom(req));
    if (current) {
      await archiveLegacyProgress(current.id, req.body.legacyProgress, req.body.guestToken);
      return res.json({
        account: safePrincipal(current),
        progress: await loadProgress(current.id),
      });
    }
    const created = await ensureGuest(req.body.guestToken, req.body.legacyProgress);
    setSession(req, res, created.token);
    return res.json({ account: created.account, progress: await loadProgress(created.account.id) });
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.post('/register', async (req, res) => {
  if (!accountsConfigured) return res.status(503).json({ error: 'accountsUnavailable' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  if (typeof req.body?.username !== 'string')
    return res.status(400).json({ error: 'invalidUsername' });
  if (typeof req.body?.password !== 'string')
    return res.status(400).json({ error: 'invalidPassword' });
  try {
    const created = await register(req.body?.username, req.body?.password, req.body?.guestToken);
    setSession(req, res, created.token);
    return res
      .status(201)
      .json({ account: created.account, progress: await loadProgress(created.account.id) });
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.post('/login', async (req, res) => {
  if (!accountsConfigured) return res.status(503).json({ error: 'accountsUnavailable' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  if (typeof req.body?.username !== 'string' || typeof req.body?.password !== 'string')
    return res.status(401).json({ error: 'invalidCredentials' });
  try {
    const signedIn = await login(req.body?.username, req.body?.password, req.body?.guestToken);
    setSession(req, res, signedIn.token);
    return res.json({
      account: signedIn.account,
      progress: await loadProgress(signedIn.account.id),
    });
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.post('/logout', async (req, res) => {
  try {
    const current = await authenticate(tokenFrom(req));
    if (current) await revokeSession(current.sessionHash);
    clearSession(req, res);
    return res.status(204).end();
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.get('/me', async (req, res) => {
  try {
    const current = await authenticate(tokenFrom(req));
    if (!current) return res.status(401).json({ error: 'notAuthenticated' });
    const matchId =
      typeof req.query.matchId === 'string' ? req.query.matchId.slice(0, 128) : undefined;
    return res.json({
      account: safePrincipal(current),
      progress: await loadProgress(current.id, matchId),
    });
  } catch (error) {
    return fail(res, error);
  }
});
