import { Room, type AuthContext, type Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import { KitchenSession, RECONNECT_SECONDS, LOBBY_TIMEOUT_SECONDS } from '../multiplayer/session';
import { accountsConfigured, canPlayLevel, persistMatch } from '../persistence/account-store';
import { principalFromCookie } from '../persistence/account-routes';
import type { Result } from '../../../../packages/shared/src/types';
class CoopState extends schema({ snapshot: t.string() }) {}
export class CoopRoom extends Room<{ state: CoopState }> {
  maxClients = 4;
  private session!: KitchenSession;
  private buckets = new Map<string, { since: number; count: number }>();
  private started = false;
  private playerByClient = new Map<string, string>();
  private persistedMatchId = '';
  private countdownUntil = 0;
  async onCreate(options: { teamSize?: unknown; levelId?: string } = {}) {
    const size = options.teamSize ?? 4;
    if (typeof size !== 'number' || ![2, 3, 4].includes(size)) throw new Error('invalidTeamSize');
    this.maxClients = size;
    const visibility = this.roomName === 'coop_public' ? 'public' : 'private';
    await this.setPrivate(visibility === 'private');
    this.session = new KitchenSession(this.roomId, visibility, size, options.levelId);
    this.setState(new CoopState());
    this.setPatchRate(50);
    this.onMessage('intent', async (client, payload: unknown) => {
      if (Date.now() < this.countdownUntil) return;
      if (!this.allow(client.sessionId)) return;
      const message = payload as { type?: unknown; levelId?: unknown } | null;
      if (
        message?.type === 'selectLevel' &&
        typeof message.levelId === 'string' &&
        accountsConfigured
      ) {
        const playerId = this.playerByClient.get(client.sessionId);
        if (!playerId || !(await canPlayLevel(playerId, message.levelId))) {
          client.send('notice', 'levelLocked');
          return this.sync();
        }
      }
      const error = this.session.command(client.sessionId, payload);
      if (error) client.send('notice', error);
      this.sync();
    });
    this.setTimestep((dt) => {
      if (Date.now() >= this.countdownUntil) this.session.tick(Math.min(0.25, dt / 1000));
      this.sync();
    }, 50);
    this.clock.setTimeout(() => {
      if (!this.started) void this.disconnect();
    }, LOBBY_TIMEOUT_SECONDS * 1000);
  }
  private allow(id: string) {
    const now = Date.now();
    let b = this.buckets.get(id);
    if (!b || now - b.since >= 1000) {
      b = { since: now, count: 0 };
      this.buckets.set(id, b);
    }
    return ++b.count <= 15;
  }
  private sync() {
    if (!this.started && this.session.game.state.phase !== 'lobby') {
      this.started = true;
      this.countdownUntil = Date.now() + 3000;
      void this.lock();
    }
    this.state.snapshot = JSON.stringify({
      ...this.session.snapshot(),
      countdown: Math.max(0, Math.ceil((this.countdownUntil - Date.now()) / 1000)),
    });
    const result = this.session.game.state.result;
    if (result && result.matchId !== this.persistedMatchId && this.playerByClient.size) {
      this.persistedMatchId = result.matchId;
      void persistMatch(result as Result, [...this.playerByClient.values()]).catch((error) => {
        this.persistedMatchId = '';
        console.error('Could not persist co-op result', error);
      });
    }
  }
  async onAuth(_client: Client, _options: { levelId?: string }, context: AuthContext) {
    if (!accountsConfigured) return { playerId: null };
    const principal = await principalFromCookie(context.headers.get('cookie') ?? undefined);
    if (!principal) throw new Error('authenticationRequired');
    const host = this.session.info.members.length === 0;
    const publicMatch = this.session.info.visibility === 'public';
    if ((host || publicMatch) && !(await canPlayLevel(principal.id, this.session.info.levelId)))
      throw new Error('levelLocked');
    return { playerId: principal.id };
  }
  onJoin(client: Client, _options: unknown, auth?: { playerId: string | null }) {
    this.session.join(client.sessionId);
    if (auth?.playerId) this.playerByClient.set(client.sessionId, auth.playerId);
    this.sync();
  }
  async onDrop(client: Client) {
    this.session.connection(client.sessionId, false);
    this.sync();
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
      this.session.connection(client.sessionId, true);
      this.sync();
    } catch {
      /* onLeave releases the inventory exactly once after reservation expiry. */
    }
  }
  onLeave(client: Client) {
    this.session.leave(client.sessionId);
    this.buckets.delete(client.sessionId);
    this.sync();
  }
}
