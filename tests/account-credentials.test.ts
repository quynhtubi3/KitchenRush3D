import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  opaqueToken,
  tokenDigest,
  verifyPassword,
} from '../apps/server/src/persistence/credentials';

describe('account credentials', () => {
  it('stores salted scrypt hashes and verifies without exposing the password', async () => {
    const one = await hashPassword('correct horse battery staple');
    const two = await hashPassword('correct horse battery staple');
    expect(one).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(one).not.toBe(two);
    expect(one).not.toContain('correct horse');
    await expect(verifyPassword('correct horse battery staple', one)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', one)).resolves.toBe(false);
    await expect(verifyPassword('anything', 'md5$bad')).resolves.toBe(false);
  });

  it('uses high-entropy opaque guest/session tokens and stores a one-way digest', () => {
    const token = opaqueToken();
    expect(token).toMatch(/^[\w-]{40,50}$/);
    expect(tokenDigest(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenDigest(token)).not.toBe(token);
  });
});
