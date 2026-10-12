import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  authenticate,
  archiveLegacyProgress,
  changePassword,
  ensureGuest,
  loadProgress,
  login,
  register,
  registerPendingEmail,
  requestEmailAction,
  resetPasswordWithAction,
  revokeSession,
  validGuestToken,
  verifyEmailAction,
} from './account-store';
import {
  emailDeliveryConfigured,
  resolveAccountEmailOrigin,
  sendAccountActionEmail,
} from './email';
import {
  accountsConfigured,
  authEnabled,
  cloudSaveEnabled,
  databaseAvailable,
  emailVerificationRequired,
  registrationEnabled,
} from './database';
import { validCsrfPair, validRequestOrigin } from './csrf';
import { accountRateLimitIp, isLoopbackTunnelPeer } from './client-ip';

const COOKIE = 'kr_session';
const CSRF_COOKIE = 'kr_csrf';
const DAY_SECONDS = 60 * 60 * 24;
const attempts = new Map<string, { window: number; count: number }>();

function cookieFrom(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function tokenFrom(req: Request) {
  return cookieFrom(req, COOKIE);
}

export function principalFromCookie(cookieHeader: string | string[] | undefined) {
  const cookie = Array.isArray(cookieHeader) ? cookieHeader.join(';') : (cookieHeader ?? '');
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key !== COOKIE) continue;
    try {
      return authenticate(decodeURIComponent(value.join('=')));
    } catch {
      return Promise.resolve(null);
    }
  }
  return Promise.resolve(null);
}

function safePrincipal(current: Awaited<ReturnType<typeof authenticate>>) {
  if (!current) return null;
  const { sessionHash: _sessionHash, ...publicAccount } = current;
  return publicAccount;
}

function secureCookie(req: Request) {
  return req.secure || req.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
}

function setSession(req: Request, res: Response, token: string) {
  const secure = secureCookie(req) ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAY_SECONDS * 30}${secure}`,
  );
}

function clearSession(req: Request, res: Response) {
  const secure = secureCookie(req) ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function setCsrf(req: Request, res: Response) {
  const token = randomBytes(32).toString('base64url');
  const secure = secureCookie(req) ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax; Max-Age=${DAY_SECONDS}${secure}`,
  );
  return token;
}

function csrfValid(req: Request) {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const expectedOrigin = `${forwardedProto === 'https' || req.secure ? 'https' : 'http'}://${req.get('host')}`;
  const configured = (process.env.ACCOUNT_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const origin = req.get('origin');
  let developmentOrigin = false;
  if (process.env.NODE_ENV !== 'production' && origin) {
    try {
      const parsed = new URL(origin);
      developmentOrigin =
        parsed.protocol === 'http:' && parsed.port === '5173' && parsed.hostname === req.hostname;
    } catch {
      developmentOrigin = false;
    }
  }
  return (
    (validRequestOrigin(origin, expectedOrigin, configured) || developmentOrigin) &&
    validCsrfPair(cookieFrom(req, CSRF_COOKIE), req.get('x-csrf-token'))
  );
}

function limited(req: Request) {
  const now = Date.now();
  const key = accountRateLimitIp(req.socket.remoteAddress, req.get('cf-connecting-ip'), req.ip);
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

function accountActionOrigin(req: Request) {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const host = req.get('host');
  const requestOrigin = forwardedProto && host ? `${forwardedProto}://${host}` : undefined;
  return resolveAccountEmailOrigin({
    configuredOrigin: process.env.ACCOUNT_PUBLIC_URL,
    requestOrigin,
    trustedTunnelPeer: isLoopbackTunnelPeer(req.socket.remoteAddress),
    cloudflareClientIp: req.get('cf-connecting-ip'),
  });
}

function fail(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : 'requestFailed';
  const statuses: Record<string, number> = {
    invalidEmail: 400,
    invalidDisplayName: 400,
    invalidPassword: 400,
    invalidGuestToken: 400,
    invalidCredentials: 401,
    notAuthenticated: 401,
    registrationDisabled: 403,
    authDisabled: 403,
    csrfInvalid: 403,
    rateLimited: 429,
    emailTaken: 409,
    guestTokenUsed: 409,
    accountsUnavailable: 503,
    guestCreationFailed: 503,
    invalidActionToken: 400,
  };
  if ((error as { code?: string })?.code === '23505')
    return res.status(409).json({ error: 'emailTaken' });
  return res
    .status(statuses[code] ?? 503)
    .json({ error: statuses[code] ? code : 'serviceUnavailable' });
}

function csrfOrReject(req: Request, res: Response) {
  if (csrfValid(req)) return true;
  res.status(403).json({ error: 'csrfInvalid' });
  return false;
}

export const accountRoutes = Router();
accountRoutes.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

accountRoutes.get('/status', async (_req, res) => {
  const available = accountsConfigured && (await databaseAvailable());
  res.json({
    accountsConfigured,
    accountsAvailable: available,
    authEnabled,
    registrationEnabled,
    cloudSaveEnabled,
    emailDeliveryConfigured,
    emailVerificationRequired,
  });
});

accountRoutes.get('/csrf', (_req, res) => {
  res.json({ csrfToken: setCsrf(_req, res) });
});

accountRoutes.post('/guest', async (req, res) => {
  if (!csrfOrReject(req, res)) return;
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
  if (!csrfOrReject(req, res)) return;
  if (!authEnabled) return res.status(403).json({ error: 'authDisabled' });
  if (!registrationEnabled) return res.status(403).json({ error: 'registrationDisabled' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  if (typeof req.body?.email !== 'string') return res.status(400).json({ error: 'invalidEmail' });
  if (typeof req.body?.displayName !== 'string')
    return res.status(400).json({ error: 'invalidDisplayName' });
  if (typeof req.body?.password !== 'string')
    return res.status(400).json({ error: 'invalidPassword' });
  try {
    if (emailVerificationRequired) {
      const origin = accountActionOrigin(req);
      if (!origin) return res.status(503).json({ error: 'emailDeliveryUnavailable' });
      const pending = await registerPendingEmail(
        req.body.email,
        req.body.password,
        req.body.displayName,
        req.body.guestToken,
        req.body.legacyProgress,
      );
      if (pending.email && pending.token)
        dispatchAccountEmail(pending.email, 'verifyEmail', pending.token, origin);
      // Keep the response identical for new, duplicate, and already-verified addresses.
      return res.status(202).json({ verificationRequired: true });
    }
    const created = await register(
      req.body.email,
      req.body.password,
      req.body.displayName,
      req.body.guestToken,
      req.body.legacyProgress,
    );
    setSession(req, res, created.token);
    return res
      .status(201)
      .json({ account: created.account, progress: await loadProgress(created.account.id) });
  } catch (error) {
    return fail(res, error);
  }
});

function dispatchAccountEmail(
  recipient: string,
  purpose: 'verifyEmail' | 'resetPassword',
  token: string,
  origin: string,
) {
  void sendAccountActionEmail(recipient, purpose, token, origin).catch((error: unknown) => {
    const code = (error as { code?: unknown })?.code;
    console.error('Account email delivery failed', {
      purpose,
      code: typeof code === 'string' ? code : 'deliveryError',
    });
  });
}

accountRoutes.post('/verification/request', async (req, res) => {
  if (!csrfOrReject(req, res)) return;
  if (!authEnabled || !emailDeliveryConfigured)
    return res.status(503).json({ error: 'emailDeliveryUnavailable' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  try {
    const origin = accountActionOrigin(req);
    if (!origin) return res.status(503).json({ error: 'emailDeliveryUnavailable' });
    const action = await requestEmailAction(req.body?.email, 'verifyEmail');
    if (action) dispatchAccountEmail(action.email, 'verifyEmail', action.token, origin);
    return res.status(202).json({ accepted: true });
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.post('/verification/confirm', async (req, res) => {
  if (!csrfOrReject(req, res)) return;
  if (!authEnabled) return res.status(403).json({ error: 'authDisabled' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  try {
    const verified = await verifyEmailAction(req.body?.token, req.body?.guestToken);
    setSession(req, res, verified.token);
    return res.json({
      account: verified.account,
      progress: await loadProgress(verified.account.id),
    });
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.post('/password-reset/request', async (req, res) => {
  if (!csrfOrReject(req, res)) return;
  if (!authEnabled || !emailDeliveryConfigured)
    return res.status(503).json({ error: 'emailDeliveryUnavailable' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  try {
    const origin = accountActionOrigin(req);
    if (!origin) return res.status(503).json({ error: 'emailDeliveryUnavailable' });
    const action = await requestEmailAction(req.body?.email, 'resetPassword');
    if (action) dispatchAccountEmail(action.email, 'resetPassword', action.token, origin);
    return res.status(202).json({ accepted: true });
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.post('/password-reset/complete', async (req, res) => {
  if (!csrfOrReject(req, res)) return;
  if (!authEnabled) return res.status(403).json({ error: 'authDisabled' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  if (typeof req.body?.nextPassword !== 'string')
    return res.status(400).json({ error: 'invalidPassword' });
  try {
    await resetPasswordWithAction(req.body?.token, req.body.nextPassword);
    clearSession(req, res);
    return res.status(204).end();
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.post('/login', async (req, res) => {
  if (!csrfOrReject(req, res)) return;
  if (!authEnabled) return res.status(403).json({ error: 'authDisabled' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  if (typeof req.body?.email !== 'string' || typeof req.body?.password !== 'string')
    return res.status(401).json({ error: 'invalidCredentials' });
  try {
    const signedIn = await login(
      req.body.email,
      req.body.password,
      req.body.guestToken,
      req.body.legacyProgress,
    );
    setSession(req, res, signedIn.token);
    return res.json({
      account: signedIn.account,
      progress: await loadProgress(signedIn.account.id),
    });
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.post('/password', async (req, res) => {
  if (!csrfOrReject(req, res)) return;
  if (!authEnabled) return res.status(403).json({ error: 'authDisabled' });
  if (!limited(req)) return res.status(429).json({ error: 'rateLimited' });
  if (typeof req.body?.currentPassword !== 'string' || typeof req.body?.nextPassword !== 'string')
    return res.status(400).json({ error: 'invalidPassword' });
  try {
    const current = await authenticate(tokenFrom(req));
    if (!current || current.isGuest) return res.status(401).json({ error: 'notAuthenticated' });
    await changePassword(
      current.id,
      current.sessionHash,
      req.body.currentPassword,
      req.body.nextPassword,
    );
    return res.status(204).end();
  } catch (error) {
    return fail(res, error);
  }
});

accountRoutes.post('/logout', async (req, res) => {
  if (!csrfOrReject(req, res)) return;
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
  if (!accountsConfigured) return res.status(503).json({ error: 'accountsUnavailable' });
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
