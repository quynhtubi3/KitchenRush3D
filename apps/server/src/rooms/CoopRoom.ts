import { Room, type AuthContext, type Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import { KitchenSession, RECONNECT_SECONDS, LOBBY_TIMEOUT_SECONDS } from '../multiplayer/session';
import { canPlayLevel, touchLastPlayed } from '../persistence/account-store';
import { authEnabled, cloudSaveEnabled } from '../persistence/database';
import { submitMatch } from '../persistence/match-persistence';
import { principalFromCookie } from '../persistence/account-routes';
import type { Result } from '../../../../packages/shared/src/types';
class CoopState extends schema({ snapshot: t.string() }) {}
export class CoopRoom extends Room<{ state: CoopState }> {
  maxClients = 4;
  private session!: KitchenSession;
  private buckets = new Map<string, { since: number; count: number }>();
  private everStarted = false;
  private observedPhase = 'lobby';
  private playerByClient = new Map<string, string>();
  private participants: string[] = [];
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
        (message?.type === 'selectLevel' || message?.type === 'continue') &&
        typeof message.levelId === 'string' &&
        cloudSaveEnabled
      ) {
        const playerId = this.playerByClient.get(client.sessionId);
        const unlocked = playerId
          ? await canPlayLevel(playerId, message.levelId).catch(() => true)
          : true;
        if (!unlocked) {
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
      if (!this.everStarted) void this.disconnect();
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
    const phase = this.session.game.state.phase;
    if (
      this.observedPhase === 'finished' &&
      phase === 'lobby' &&
      this.session.info.visibility === 'private'
    )
      void this.unlock();
    if (this.observedPhase === 'lobby' && phase === 'playing') {
      this.everStarted = true;
      void this.lock();
      this.participants = [
        ...new Set(
          this.session.info.members
            .filter((member) => member.connected)
            .flatMap((member) => this.playerByClient.get(member.id) ?? []),
        ),
      ];
      this.countdownUntil = Date.now() + 3000;
      this.persistedMatchId = '';
    }
    this.observedPhase = phase;
    this.state.snapshot = JSON.stringify({
      ...this.session.snapshot(),
      countdown: Math.max(0, Math.ceil((this.countdownUntil - Date.now()) / 1000)),
    });
    const result = this.session.game.state.result;
    if (result && result.matchId !== this.persistedMatchId && this.participants.length) {
      submitMatch(result as Result, this.participants);
      this.persistedMatchId = result.matchId;
    }
  }
  async onAuth(_client: Client, _options: { levelId?: string }, context: AuthContext) {
    if (!authEnabled && !cloudSaveEnabled) return { playerId: null };
    const principal = await principalFromCookie(context.headers.get('cookie') ?? undefined).catch(
      () => null,
    );
    const host = this.session.info.members.length === 0;
    const publicMatch = this.session.info.visibility === 'public';
    if (principal && cloudSaveEnabled && (host || publicMatch)) {
      const unlocked = await canPlayLevel(principal.id, this.session.info.levelId).catch(
        () => true,
      );
      if (!unlocked) throw new Error('levelLocked');
    }
    if (principal) await touchLastPlayed(principal.id).catch(() => undefined);
    return { playerId: principal?.id ?? null };
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
    this.playerByClient.delete(client.sessionId);
    this.session.leave(client.sessionId);
    this.buckets.delete(client.sessionId);
    this.sync();
  }
}
