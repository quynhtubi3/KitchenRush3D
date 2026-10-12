import { timingSafeEqual } from 'node:crypto';

const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

export function validCsrfPair(cookie: unknown, header: unknown) {
  if (typeof cookie !== 'string' || typeof header !== 'string') return false;
  if (!TOKEN.test(cookie) || !TOKEN.test(header)) return false;
  const left = Buffer.from(cookie);
  const right = Buffer.from(header);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validRequestOrigin(
  origin: unknown,
  expectedOrigin: string,
  allowed: string[] = [],
) {
  if (typeof origin !== 'string') return false;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;
    return parsed.origin === expectedOrigin || allowed.includes(parsed.origin);
  } catch {
    return false;
  }
}
