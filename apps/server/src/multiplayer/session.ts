import { Game } from '../simulation/game';
import { level } from '../../../../packages/content/src/index';
import { getLevel, scaledLevel } from '../../../../packages/content/src/campaign';
import {
  EMOTES,
  QUICK_CHAT,
  type SessionState,
  type Snapshot,
  type SocialIntent,
} from '../../../../packages/shared/src/types';
import { parseIntent } from '../rooms/protocol';

export const RECONNECT_SECONDS = 20;
export const LOBBY_TIMEOUT_SECONDS = 600;
export function teamConfig(size: number, id = level.id) {
  const config = scaledLevel(id, size);
  return {
    ...config,
    patience: config.patience + (size - 1) * 20,
    queuePatience: config.queuePatience + (size - 1) * 12,
  };
}
export class KitchenSession {
  game: Game;
  readonly info: SessionState;
  private signalSerial = 0;
  private socialTimes = new Map<string, number>();
  constructor(
    code: string,
    visibility: 'private' | 'public',
    capacity: number,
    levelId = level.id,
  ) {
    if (![2, 3, 4].includes(capacity)) throw new Error('invalidTeamSize');
    getLevel(levelId);
    this.game = new Game({ id: levelId }, code);
    this.game.state.phase = 'lobby';
    this.info = {
      code,
      visibility,
      capacity,
      host: '',
      levelId,
      members: [],
      startedSize: 0,
      votes: [],
      targetScore: level.targetScore,
      targetOrders: level.targetOrders,
      signals: [],
    };
  }
  snapshot(): Snapshot {
    return { ...this.game.state, session: this.info };
  }
  join(id: string) {
    if (this.game.state.phase !== 'lobby' || this.info.members.length >= this.info.capacity)
      throw new Error('roomUnavailable');
    const slot = [0, 1, 2, 3].find((n) => !this.info.members.some((m) => m.slot === n))!;
    this.info.members.push({ id, slot, ready: false, connected: true });
    this.game.addChef(id, slot);
    this.resetReady();
    this.electHost();
  }
  private resetReady() {
    this.info.members.forEach((m) => (m.ready = false));
  }
  private electHost() {
    if (!this.info.members.some((m) => m.id === this.info.host && m.connected))
      this.info.host = this.info.members.find((m) => m.connected)?.id ?? '';
  }
  connection(id: string, connected: boolean) {
    const member = this.info.members.find((m) => m.id === id);
    if (!member) return;
    member.connected = connected;
    member.ready = false;
    const chef = this.game.state.chefs[id];
    if (chef) {
      chef.connected = connected;
      chef.path = [];
      chef.target = null;
    }
    this.info.votes = this.info.votes.filter((v) => v !== id);
    this.electHost();
    this.checkVote();
  }
  leave(id: string) {
    this.info.members = this.info.members.filter((m) => m.id !== id);
    this.info.votes = this.info.votes.filter((v) => v !== id);
    this.socialTimes.delete(id);
    this.game.removeChef(id);
    this.electHost();
    if (this.game.state.phase === 'lobby') this.resetReady();
    else this.checkVote();
  }
  command(id: string, payload: unknown): string | null {
    const member = this.info.members.find((m) => m.id === id && m.connected);
    if (!member || !payload || typeof payload !== 'object') return 'invalidCommand';
    const p = payload as Record<string, unknown>;
    if (p.type === 'ready') {
      if (this.game.state.phase !== 'lobby' || typeof p.ready !== 'boolean')
        return 'invalidCommand';
      member.ready = p.ready;
      if (this.info.visibility === 'public' && this.canStart()) this.start();
      return null;
    }
    if (p.type === 'selectLevel') {
      if (
        this.game.state.phase !== 'lobby' ||
        id !== this.info.host ||
        typeof p.levelId !== 'string' ||
        (this.info.visibility === 'public' && p.levelId !== this.info.levelId)
      )
        return 'invalidCommand';
      try {
        getLevel(p.levelId as string);
      } catch {
        return 'invalidCommand';
      }
      this.info.levelId = p.levelId as string;
      this.resetReady();
      return null;
    }
    if (p.type === 'start') {
      if (id !== this.info.host || !this.canStart()) return 'notReady';
      this.start();
      return null;
    }
    if (p.type === 'voteFinish') {
      if (
        this.game.state.phase !== 'playing' ||
        !this.game.canWin() ||
        typeof p.agree !== 'boolean'
      )
        return 'goalsRequired';
      this.info.votes = this.info.votes.filter((v) => v !== id);
      if (p.agree) this.info.votes.push(id);
      this.checkVote();
      return null;
    }
    if (p.type === 'quickChat' || p.type === 'emote' || p.type === 'ping') {
      if (this.game.state.phase === 'finished' || typeof p.value !== 'string')
        return 'invalidCommand';
      if (p.type === 'quickChat' && !(QUICK_CHAT as readonly string[]).includes(p.value))
        return 'invalidCommand';
      if (p.type === 'emote' && !(EMOTES as readonly string[]).includes(p.value))
        return 'invalidCommand';
      if (p.type === 'ping' && !this.game.state.stations.some((s) => s.id === p.value))
        return 'invalidCommand';
      const now = Date.now();
      if (now - (this.socialTimes.get(id) ?? 0) < 1000) return 'rateLimited';
      this.socialTimes.set(id, now);
      this.info.signals.push({
        ...({ type: p.type, value: p.value } as SocialIntent),
        id: ++this.signalSerial,
        from: id,
        expires: now + 6000,
      });
      this.info.signals = this.info.signals.slice(-8);
      return null;
    }
    const intent = parseIntent(p);
    if (!intent || intent.type === 'pause' || intent.type === 'finish') return 'invalidCommand';
    if (this.game.state.phase !== 'playing') return 'invalidCommand';
    this.game.intent(id, intent);
    return null;
  }
  private canStart() {
    const m = this.info.members;
    return (
      this.game.state.phase === 'lobby' &&
      m.length >= 2 &&
      m.every((p) => p.connected && p.ready) &&
      (this.info.visibility === 'private' || m.length === this.info.capacity)
    );
  }
  private start() {
    this.info.startedSize = this.info.members.length;
    const config = teamConfig(this.info.startedSize, this.info.levelId);
    this.info.targetScore = config.targetScore;
    this.info.targetOrders = config.targetOrders;
    this.game = new Game(config, this.info.code);
    this.info.members.forEach((m) => this.game.addChef(m.id, m.slot));
  }
  private checkVote() {
    const active = this.info.members.filter((m) => m.connected);
    if (
      this.game.state.phase === 'playing' &&
      this.game.canWin() &&
      active.length > 0 &&
      active.every((m) => this.info.votes.includes(m.id))
    )
      this.game.intent(active[0].id, { type: 'finish' });
    this.annotateResult();
  }
  private annotateResult() {
    if (this.game.state.result) this.game.state.result.teamSize = this.info.startedSize;
  }
  tick(dt: number) {
    this.game.tick(dt);
    this.info.signals = this.info.signals.filter((s) => s.expires > Date.now());
    this.annotateResult();
  }
}
