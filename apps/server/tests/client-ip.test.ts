import { describe, expect, it } from 'vitest';
import { accountRateLimitIp } from '../src/persistence/client-ip';

describe('account rate-limit client IP', () => {
  it('uses Cloudflare visitor IP only when the TCP peer is local', () => {
    expect(accountRateLimitIp('127.0.0.1', '198.51.100.12', '127.0.0.1')).toBe('198.51.100.12');
    expect(accountRateLimitIp('::ffff:127.0.0.1', '2001:db8::12', '127.0.0.1')).toBe(
      '2001:db8::12',
    );
  });

  it('ignores forged, malformed and non-Cloudflare forwarded headers', () => {
    expect(accountRateLimitIp('203.0.113.7', '198.51.100.12', '203.0.113.7')).toBe('203.0.113.7');
    expect(accountRateLimitIp('127.0.0.1', 'not-an-ip', '127.0.0.1')).toBe('127.0.0.1');
    expect(accountRateLimitIp(undefined, undefined, undefined)).toBe('unknown');
  });
});
