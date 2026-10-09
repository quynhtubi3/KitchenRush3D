import { Room, type AuthContext, type Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import { Game } from '../simulation/game';
import { parseIntent } from './protocol';
import { accountsConfigured, canPlayLevel, persistMatch } from '../persistence/account-store';
import { principalFromCookie } from '../persistence/account-routes';
import type { Result } from '../../../../packages/shared/src/types';

class KitchenState extends schema({ snapshot: t.string() }) {}

export class KitchenRoom extends Room<{ state: KitchenState }> {
  maxClients = 1;
  private game!: Game;
  private buckets = new Map<string, { since: number; count: number }>();
  private playerByClient = new Map<string, string>();
  private persistedMatchId = '';
  private countdownUntil = 0;
  async onAuth(_client: Client, options: { levelId?: string }, context: AuthContext) {
    if (!accountsConfigured) return { playerId: null };
    const principal = await principalFromCookie(context.headers.get('cookie') ?? undefined);
    if (!principal) throw new Error('authenticationRequired');
    const requested = options?.levelId ?? 'little-sun-01';
    if (!(await canPlayLevel(principal.id, requested))) throw new Error('levelLocked');
    return { playerId: principal.id };
  }
  onCreate(options: { levelId?: string } = {}) {
    this.game = new Game({ id: options.levelId }, this.roomId);
    this.setState(new KitchenState());
    this.setPatchRate(50);
    this.onMessage('intent', (client, payload: unknown) => {
      if (!this.allow(client.sessionId) || !payload || typeof payload !== 'object') return;
      const intent = parseIntent(payload);
      if (Date.now() < this.countdownUntil) return;
      if (intent) {
        this.game.intent(client.sessionId, intent);
        this.sync();
      }
    });
    this.setTimestep((dt) => {
      if (Date.now() >= this.countdownUntil) this.game.tick(Math.min(dt / 1000, 0.25));
      this.sync();
    }, 50);
  }
  private allow(id: string) {
    const now = Date.now();
    let bucket = this.buckets.get(id);
    if (!bucket || now - bucket.since >= 1000) {
      bucket = { since: now, count: 0 };
      this.buckets.set(id, bucket);
    }
    return ++bucket.count <= 15;
  }
  private sync() {
    this.state.snapshot = JSON.stringify({
      ...this.game.state,
      countdown: Math.max(0, Math.ceil((this.countdownUntil - Date.now()) / 1000)),
    });
    const result = this.game.state.result;
    if (result && result.matchId !== this.persistedMatchId && this.playerByClient.size) {
      this.persistedMatchId = result.matchId;
      void persistMatch(result as Result, [...this.playerByClient.values()]).catch((error) => {
        this.persistedMatchId = '';
        console.error('Could not persist Solo result', error);
      });
    }
  }
  onJoin(client: Client, _options: unknown, auth?: { playerId: string | null }) {
    this.countdownUntil = Date.now() + 3000;
    this.game.addChef(client.sessionId);
    if (auth?.playerId) this.playerByClient.set(client.sessionId, auth.playerId);
    this.sync();
  }
  async onDrop(client: Client) {
    const chef = this.game.state.chefs[client.sessionId];
    if (!chef) return;
    chef.connected = false;
    const wasPlaying = this.game.state.phase === 'playing';
    if (wasPlaying) this.game.state.phase = 'paused';
    this.sync();
    try {
      await this.allowReconnection(client, 20);
      chef.connected = true;
      if (wasPlaying && this.game.state.phase === 'paused') this.game.state.phase = 'playing';
      this.sync();
    } catch {
      this.buckets.delete(client.sessionId);
    }
  }
  onLeave(client: Client) {
    this.buckets.delete(client.sessionId);
  }
}
