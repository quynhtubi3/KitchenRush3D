export type ProgressRecord = {
  levelId: string;
  completed: boolean;
  wins: number;
  bestScore: number;
  bestStars: number;
  bestServed: number;
  bestMissed: number;
  bestCombo: number;
  bestAverageService: number;
};
export type Account = {
  id: string;
  displayName: string;
  playerCode: string;
  username: string | null;
  isGuest: boolean;
};
export type AccountState = {
  configured: boolean;
  available: boolean;
  account: Account | null;
  progress: {
    wins: string[];
    unlocked: string[];
    levels: ProgressRecord[];
    legacyProgressIsUnverified: boolean;
  } | null;
  error: string;
};

function randomGuestToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function oldProgress() {
  let wins: unknown;
  try {
    wins = JSON.parse(localStorage.getItem('kr-campaign-wins') ?? '[]');
  } catch {
    wins = [];
  }
  const stars: Record<string, number> = {};
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('kr-stars-')) continue;
    const value = Number(localStorage.getItem(key));
    if (Number.isInteger(value) && value >= 0 && value <= 3)
      stars[key.slice('kr-stars-'.length)] = value;
  }
  const teams: Record<string, ReturnType<typeof safeResult>> = {};
  for (const size of [2, 3, 4])
    teams[String(size)] = safeResult(localStorage.getItem(`kr-team-${size}-last`));
  return {
    wins,
    stars,
    best: safeResult(localStorage.getItem('kr-best')),
    last: safeResult(localStorage.getItem('kr-last-result')),
    teams,
  };
}

function safeResult(raw: string | null) {
  if (!raw) return null;
  try {
    const result = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof result.levelId !== 'string' ||
      typeof result.score !== 'number' ||
      typeof result.stars !== 'number' ||
      typeof result.won !== 'boolean'
    )
      return null;
    return {
      levelId: result.levelId,
      score: Math.max(0, Math.floor(result.score)),
      stars: Math.max(0, Math.min(3, Math.floor(result.stars))),
      won: result.won,
    };
  } catch {
    return null;
  }
}

export class AccountClient {
  readonly state: AccountState = {
    configured: false,
    available: false,
    account: null,
    progress: null,
    error: '',
  };
  private base = '';
  private guestToken = '';

  async bootstrap(base: string) {
    this.base = base.replace(/\/$/, '');
    try {
      const status = await fetch(`${this.base}/api/account/status`, { credentials: 'include' });
      if (!status.ok) throw new Error('serviceUnavailable');
      const value = (await status.json()) as {
        accountsConfigured: boolean;
        accountsAvailable: boolean;
      };
      this.state.configured = value.accountsConfigured;
      this.state.available = value.accountsAvailable;
      if (!value.accountsConfigured) return this.state;
      if (!value.accountsAvailable) {
        this.state.error = 'databaseUnavailable';
        return this.state;
      }
      this.guestToken = localStorage.getItem('kr-guest-token') || randomGuestToken();
      localStorage.setItem('kr-guest-token', this.guestToken);
      const response = await fetch(`${this.base}/api/account/guest`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestToken: this.guestToken, legacyProgress: oldProgress() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'serviceUnavailable');
      this.accept(body);
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'serviceUnavailable';
    }
    return this.state;
  }

  private accept(body: { account: Account; progress: AccountState['progress'] }) {
    this.state.account = body.account;
    this.state.progress = body.progress;
    this.state.available = true;
  }

  async authenticate(action: 'login' | 'register', username: string, password: string) {
    if (!this.state.configured || !this.state.available)
      throw new Error(this.state.error || 'accountsUnavailable');
    const response = await fetch(`${this.base}/api/account/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, guestToken: this.guestToken }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'requestFailed');
    this.accept(body);
    this.state.error = '';
    return this.state;
  }

  async refresh(matchId?: string) {
    if (!this.state.configured || !this.state.available) return null;
    const query = matchId ? `?matchId=${encodeURIComponent(matchId)}` : '';
    const response = await fetch(`${this.base}/api/account/me${query}`, { credentials: 'include' });
    if (!response.ok) return null;
    const body = await response.json();
    this.accept(body);
    if (matchId && body.progress.persistedMatchId !== matchId) return null;
    return this.state.progress;
  }

  async logout() {
    const loggedOut = await fetch(`${this.base}/api/account/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!loggedOut.ok) throw new Error('serviceUnavailable');
    this.state.account = null;
    this.state.progress = null;
    this.guestToken = randomGuestToken();
    localStorage.setItem('kr-guest-token', this.guestToken);
    const response = await fetch(`${this.base}/api/account/guest`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestToken: this.guestToken }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'requestFailed');
    this.accept(body);
  }
}
