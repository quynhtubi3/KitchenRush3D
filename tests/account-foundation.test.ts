import { describe, expect, it } from 'vitest';
import { validCsrfPair, validRequestOrigin } from '../apps/server/src/persistence/csrf';
import {
  normalizeDisplayName,
  normalizeEmail,
  validPassword,
} from '../apps/server/src/persistence/identity';

describe('account identity validation', () => {
  it('normalizes email case/spacing and rejects malformed or oversized identities', () => {
    expect(normalizeEmail('  Player@Example.COM ')).toBe('player@example.com');
    expect(normalizeEmail('missing-at.example.com')).toBeNull();
    expect(normalizeEmail(`a@${'x'.repeat(250)}.com`)).toBeNull();
  });

  it('bounds display names by Unicode code points and rejects control characters', () => {
    expect(normalizeDisplayName('  Chef 🧑‍🍳  ')).toBe('Chef 🧑‍🍳');
    expect(normalizeDisplayName('')).toBeNull();
    expect(normalizeDisplayName('bad\nname')).toBeNull();
    expect(normalizeDisplayName('🧑'.repeat(33))).toBeNull();
  });

  it('requires a bounded password without logging or transforming it', () => {
    expect(validPassword('1234567890')).toBe(true);
    expect(validPassword('short')).toBe(false);
    expect(validPassword('x'.repeat(129))).toBe(false);
  });
});

describe('cookie CSRF checks', () => {
  it('requires matching high-entropy cookie and request token values', () => {
    const token = 'A'.repeat(43);
    expect(validCsrfPair(token, token)).toBe(true);
    expect(validCsrfPair(token, `${token}x`)).toBe(false);
    expect(validCsrfPair(undefined, token)).toBe(false);
    expect(validCsrfPair('short', 'short')).toBe(false);
  });

  it('accepts only the exact expected origin or configured allowlist origins', () => {
    expect(validRequestOrigin('https://game.example', 'https://game.example')).toBe(true);
    expect(
      validRequestOrigin('https://other.example', 'https://game.example', [
        'https://other.example',
      ]),
    ).toBe(true);
    expect(validRequestOrigin('https://evil.example', 'https://game.example')).toBe(false);
    expect(validRequestOrigin('null', 'https://game.example')).toBe(false);
    expect(validRequestOrigin('https://game.example/path', 'https://game.example')).toBe(false);
  });
});
