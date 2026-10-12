import { describe, expect, it } from 'vitest';
import { buildAccountActionUrl, resolveAccountEmailOrigin } from '../src/persistence/email';

describe('account action links', () => {
  it('keeps one-time tokens in the URL fragment rather than HTTP query parameters', () => {
    const token = 'a'.repeat(43);
    for (const purpose of ['verifyEmail', 'resetPassword'] as const) {
      const url = new URL(buildAccountActionUrl('https://game.example.test', purpose, token));
      expect(url.search).toBe('');
      expect(new URLSearchParams(url.hash.slice(1)).get(purpose)).toBe(token);
    }
  });

  it('rejects insecure or path-bearing public origins', () => {
    expect(() => buildAccountActionUrl('http://game.example.test', 'verifyEmail', 'x')).toThrow(
      'invalidEmailOrigin',
    );
    expect(() =>
      buildAccountActionUrl('https://game.example.test/account', 'resetPassword', 'x'),
    ).toThrow('invalidEmailOrigin');
  });

  it('uses the active Quick Tunnel host only through a trusted Cloudflare loopback request', () => {
    const trustedRequest = {
      configuredOrigin: 'auto',
      requestOrigin: 'https://warm-soup-42.trycloudflare.com',
      trustedTunnelPeer: true,
      cloudflareClientIp: '203.0.113.8',
    };
    expect(resolveAccountEmailOrigin(trustedRequest)).toBe(
      'https://warm-soup-42.trycloudflare.com',
    );
    expect(resolveAccountEmailOrigin({ ...trustedRequest, trustedTunnelPeer: false })).toBeNull();
    expect(
      resolveAccountEmailOrigin({ ...trustedRequest, cloudflareClientIp: 'not-an-ip' }),
    ).toBeNull();
    expect(
      resolveAccountEmailOrigin({ ...trustedRequest, requestOrigin: 'https://trycloudflare.com' }),
    ).toBeNull();
    expect(
      resolveAccountEmailOrigin({
        ...trustedRequest,
        requestOrigin: 'https://fake.trycloudflare.com.attacker.test',
      }),
    ).toBeNull();
    expect(
      resolveAccountEmailOrigin({
        ...trustedRequest,
        requestOrigin: 'http://warm-soup-42.trycloudflare.com',
      }),
    ).toBeNull();
  });
});
