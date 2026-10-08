import { Room, type Client } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import { KitchenSession, RECONNECT_SECONDS, LOBBY_TIMEOUT_SECONDS } from '../multiplayer/session';
class CoopState extends schema({ snapshot: t.string() }) {}
export class CoopRoom extends Room<{ state: CoopState }> {
  maxClients = 4;
  private session!: KitchenSession;
  private buckets = new Map<string, { since: number; count: number }>();
  private started = false;
  async onCreate(options: { teamSize?: unknown; levelId?: string } = {}) {
    const size = options.teamSize ?? 4;
    if (typeof size !== 'number' || ![2, 3, 4].includes(size)) throw new Error('invalidTeamSize');
    this.maxClients = size;
    const visibility = this.roomName === 'coop_public' ? 'public' : 'private';
    await this.setPrivate(visibility === 'private');
    this.session = new KitchenSession(this.roomId, visibility, size, options.levelId);
    this.setState(new CoopState());
    this.setPatchRate(50);
    this.onMessage('intent', (client, payload: unknown) => {
      if (!this.allow(client.sessionId)) return;
      const error = this.session.command(client.sessionId, payload);
      if (error) client.send('notice', error);
      this.sync();
    });
    this.setTimestep((dt) => {
      this.session.tick(Math.min(0.25, dt / 1000));
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
      void this.lock();
    }
    this.state.snapshot = JSON.stringify(this.session.snapshot());
  }
  onJoin(client: Client) {
    this.session.join(client.sessionId);
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
