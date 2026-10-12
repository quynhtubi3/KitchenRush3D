export type ProgressRecord = {
  restaurantId: string;
  levelId: string;
  completed: boolean;
  wins: number;
  bestScore: number;
  bestStars: number;
  bestServed: number;
  bestMissed: number;
  bestCombo: number;
  bestAverageService: number;
  updatedAt: string;
};
export type Account = {
  id: string;
  displayName: string;
  playerCode: string;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  isGuest: boolean;
  createdAt: string;
  lastPlayedAt: string | null;
  defaultChefAppearance: Record<string, unknown>;
};
export type AccountState = {
  configured: boolean;
  available: boolean;
  authEnabled: boolean;
  registrationEnabled: boolean;
  emailDeliveryConfigured: boolean;
  emailVerificationRequired: boolean;
  verificationPending: boolean;
  cloudSaveEnabled: boolean;
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
    authEnabled: false,
    registrationEnabled: false,
    emailDeliveryConfigured: false,
    emailVerificationRequired: false,
    verificationPending: false,
    cloudSaveEnabled: false,
    account: null,
    progress: null,
    error: '',
  };
  private base = '';
  private guestToken = '';
  private csrfToken = '';

  async bootstrap(base: string) {
    this.base = base.replace(/\/$/, '');
    try {
      const status = await fetch(`${this.base}/api/account/status`, { credentials: 'include' });
      if (!status.ok) throw new Error('serviceUnavailable');
      const value = (await status.json()) as {
        accountsConfigured: boolean;
        accountsAvailable: boolean;
        authEnabled: boolean;
        registrationEnabled: boolean;
        emailDeliveryConfigured: boolean;
        emailVerificationRequired: boolean;
        cloudSaveEnabled: boolean;
      };
      this.state.configured = value.accountsConfigured;
      this.state.available = value.accountsAvailable;
      this.state.authEnabled = value.authEnabled;
      this.state.registrationEnabled = value.registrationEnabled;
      this.state.emailDeliveryConfigured = value.emailDeliveryConfigured;
      this.state.emailVerificationRequired = value.emailVerificationRequired;
      this.state.cloudSaveEnabled = value.cloudSaveEnabled;
      if (!value.accountsConfigured) return this.state;
      if (!value.accountsAvailable) {
        this.state.error = 'databaseUnavailable';
        return this.state;
      }
      this.guestToken = localStorage.getItem('kr-guest-token') || randomGuestToken();
      localStorage.setItem('kr-guest-token', this.guestToken);
      await this.loadCsrfToken();
      const response = await fetch(`${this.base}/api/account/guest`, {
        method: 'POST',
        credentials: 'include',
        headers: this.headers(),
        body: JSON.stringify({ guestToken: this.guestToken }),
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
    this.state.verificationPending = false;
  }

  private headers() {
    return { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrfToken };
  }

  private async loadCsrfToken() {
    const response = await fetch(`${this.base}/api/account/csrf`, { credentials: 'include' });
    if (!response.ok) throw new Error('serviceUnavailable');
    const body = (await response.json()) as { csrfToken?: string };
    if (!body.csrfToken) throw new Error('serviceUnavailable');
    this.csrfToken = body.csrfToken;
  }

  async authenticate(
    action: 'login' | 'register',
    email: string,
    password: string,
    displayName = '',
    importLegacyProgress = false,
  ) {
    if (!this.state.configured || !this.state.available)
      throw new Error(this.state.error || 'accountsUnavailable');
    if (!this.csrfToken) await this.loadCsrfToken();
    const response = await fetch(`${this.base}/api/account/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: this.headers(),
      body: JSON.stringify({
        email,
        password,
        ...(action === 'register' ? { displayName } : {}),
        guestToken: this.guestToken,
        legacyProgress: importLegacyProgress ? oldProgress() : undefined,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'requestFailed');
    if (body.verificationRequired) {
      this.state.verificationPending = true;
      this.state.error = '';
      return this.state;
    }
    this.state.verificationPending = false;
    this.accept(body);
    this.state.error = '';
    return this.state;
  }

  private async postAction(path: string, body: Record<string, unknown>) {
    if (!this.state.configured || !this.state.available)
      throw new Error(this.state.error || 'accountsUnavailable');
    if (!this.csrfToken) await this.loadCsrfToken();
    const response = await fetch(`${this.base}/api/account/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const value = await response.json().catch(() => ({}));
      throw new Error(value.error || 'requestFailed');
    }
    return response.status === 204 ? null : response.json();
  }

  async requestEmailVerification(email: string) {
    await this.postAction('verification/request', { email });
  }

  async verifyEmail(token: string) {
    const body = await this.postAction('verification/confirm', {
      token,
      guestToken: this.guestToken,
    });
    this.state.verificationPending = false;
    this.accept(body);
    this.state.error = '';
  }

  async requestPasswordReset(email: string) {
    await this.postAction('password-reset/request', { email });
  }

  async completePasswordReset(token: string, nextPassword: string) {
    await this.postAction('password-reset/complete', { token, nextPassword });
    this.state.account = null;
    this.state.progress = null;
    await this.createGuestSession();
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
    if (!this.csrfToken) await this.loadCsrfToken();
    const loggedOut = await fetch(`${this.base}/api/account/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: this.headers(),
    });
    if (!loggedOut.ok) throw new Error('serviceUnavailable');
    await this.createGuestSession();
  }

  private async createGuestSession() {
    this.state.account = null;
    this.state.progress = null;
    this.state.verificationPending = false;
    this.guestToken = randomGuestToken();
    localStorage.setItem('kr-guest-token', this.guestToken);
    const response = await fetch(`${this.base}/api/account/guest`, {
      method: 'POST',
      credentials: 'include',
      headers: this.headers(),
      body: JSON.stringify({ guestToken: this.guestToken }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'requestFailed');
    this.accept(body);
  }

  async changePassword(currentPassword: string, nextPassword: string) {
    if (!this.csrfToken) await this.loadCsrfToken();
    const response = await fetch(`${this.base}/api/account/password`, {
      method: 'POST',
      credentials: 'include',
      headers: this.headers(),
      body: JSON.stringify({ currentPassword, nextPassword }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'requestFailed');
    }
  }
}
