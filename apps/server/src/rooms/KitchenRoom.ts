import { Room, type AuthContext, type Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import { Game } from '../simulation/game';
import { parseIntent } from './protocol';
import { canPlayLevel, touchLastPlayed } from '../persistence/account-store';
import { authEnabled, cloudSaveEnabled } from '../persistence/database';
import { submitMatch } from '../persistence/match-persistence';
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
  private joined = false;
  async onAuth(_client: Client, options: { levelId?: string }, context: AuthContext) {
    if (!authEnabled && !cloudSaveEnabled) return { playerId: null };
    const principal = await principalFromCookie(context.headers.get('cookie') ?? undefined).catch(
      () => null,
    );
    const requested = options?.levelId ?? 'little-sun-01';
    if (principal && cloudSaveEnabled) {
      const unlocked = await canPlayLevel(principal.id, requested).catch(() => true);
      if (!unlocked) throw new Error('levelLocked');
    }
    if (principal) await touchLastPlayed(principal.id).catch(() => undefined);
    return { playerId: principal?.id ?? null };
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
      // Matchmaking creates the room before its reserved WebSocket seat is joined.
      // Network/authentication delays must not consume the player's shift.
      if (this.joined && Date.now() >= this.countdownUntil)
        this.game.tick(Math.min(dt / 1000, 0.25));
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
      submitMatch(result as Result, [...this.playerByClient.values()]);
      this.persistedMatchId = result.matchId;
    }
  }
  onJoin(client: Client, _options: unknown, auth?: { playerId: string | null }) {
    this.countdownUntil = Date.now() + 3000;
    this.game.addChef(client.sessionId);
    this.joined = true;
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
