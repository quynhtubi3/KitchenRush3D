import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountClient } from '../apps/client/src/account';

afterEach(() => vi.unstubAllGlobals());

describe('account client result confirmation', () => {
  it('keeps a newly registered production account pending until email verification', async () => {
    const client = new AccountClient();
    client.state.configured = client.state.available = true;
    const csrfToken = 'C'.repeat(43);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ verificationRequired: true }), { status: 202 }),
      );
    vi.stubGlobal('fetch', fetch);

    await client.authenticate('register', 'player@example.test', 'secure password 123', 'Chef');

    expect(client.state.verificationPending).toBe(true);
    expect(client.state.account).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/account/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({
        email: 'player@example.test',
        password: 'secure password 123',
        displayName: 'Chef',
        guestToken: '',
        legacyProgress: undefined,
      }),
    });
  });

  it('does not treat an older profile response as confirmation of the current match', async () => {
    const client = new AccountClient();
    client.state.configured = client.state.available = true;
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account: { id: 'player' },
          progress: { persistedMatchId: null },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await client.refresh('current-match')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/account/me?matchId=current-match', {
      credentials: 'include',
    });
  });

  it('accepts confirmation only for the requested match', async () => {
    const client = new AccountClient();
    client.state.configured = client.state.available = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            account: { id: 'player' },
            progress: { persistedMatchId: 'current-match', wins: ['little-sun-01'] },
          }),
        ),
      ),
    );
    expect(await client.refresh('current-match')).toMatchObject({ wins: ['little-sun-01'] });
  });

  it('does not replace local identity if the logout request failed', async () => {
    const client = new AccountClient();
    const identity = {
      id: 'player',
      displayName: 'Player',
      username: 'player',
      email: 'player@example.test',
      emailVerified: true,
      playerCode: 'KR-TEST',
      isGuest: false,
      createdAt: new Date(0).toISOString(),
      lastPlayedAt: null,
      defaultChefAppearance: { variant: 'classic' },
    };
    client.state.account = identity;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'A'.repeat(43) })))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(client.logout()).rejects.toThrow('serviceUnavailable');
    expect(client.state.account).toBe(identity);
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/account/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'A'.repeat(43) },
    });
  });
});
