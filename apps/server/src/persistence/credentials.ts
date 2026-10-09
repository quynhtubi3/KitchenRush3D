import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const KEY_BYTES = 64;

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_BYTES,
      { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key as Buffer)),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$32768$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, encodedSalt, encodedKey, extra] = stored.split('$');
  if (algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '1' || extra !== undefined)
    return false;
  try {
    const salt = Buffer.from(encodedSalt, 'base64url');
    const expected = Buffer.from(encodedKey, 'base64url');
    if (salt.length !== 16 || expected.length !== KEY_BYTES) return false;
    const actual = await derive(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function opaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function tokenDigest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
