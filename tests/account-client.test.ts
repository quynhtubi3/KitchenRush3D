import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountClient } from '../apps/client/src/account';

afterEach(() => vi.unstubAllGlobals());

describe('account client result confirmation', () => {
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
      playerCode: 'KR-TEST',
      isGuest: false,
    };
    client.state.account = identity;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(client.logout()).rejects.toThrow('serviceUnavailable');
    expect(client.state.account).toBe(identity);
  });
});
