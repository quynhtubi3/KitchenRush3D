import { level } from '../../../../packages/content/src/index';
import {
  getLevel,
  recipeById,
  dishRecipe,
  customerTypes,
} from '../../../../packages/content/src/campaign';
import type {
  Chef,
  Customer,
  Intent,
  Item,
  ItemKind,
  Point,
  Snapshot,
  Station,
} from '../../../../packages/shared/src/types';
import { findPath, key, neighbors } from './pathfinding';
export class Game {
  readonly config: typeof level;
  readonly state: Snapshot;
  private serial = 0;
  private spawnClock = 0;
  private serviceTotal = 0;
  readonly blocked: Set<string>;
  readonly content;
  private guestSerial = 0;
  constructor(
    config: Partial<typeof level> = {},
    readonly matchId = 'local',
  ) {
    this.content = getLevel(config.id ?? level.id);
    this.config = { ...this.content, ...config };
    this.blocked = new Set(this.content.stations.map(key));
    this.state = {
      phase: 'playing',
      levelId: this.content.id,
      remaining: this.config.duration,
      elapsed: 0,
      score: 0,
      served: 0,
      missed: 0,
      combo: 0,
      bestCombo: 0,
      chefs: {},
      stations: this.content.stations.map((s) => ({
        ...s,
        item: null,
        progress: 0,
        phase: 'idle',
        elapsed: 0,
        stock: [],
      })),
      customers: [],
      result: null,
      event: { seq: 0, key: 'welcome' },
    };
    const rack = this.station('rack');
    for (let i = 0; i < this.config.plates; i++) rack.stock.push(this.item('plate'));
    this.spawn();
  }
  private item(kind: ItemKind): Item {
    return { id: `item-${++this.serial}`, kind, parts: [] };
  }
  station(id: string) {
    const s = this.state.stations.find((s) => s.id === id);
    if (!s) throw new Error('Unknown station');
    return s;
  }
  addChef(id: string, slot = 0) {
    if (this.state.chefs[id]) return;
    this.state.chefs[id] = {
      id,
      x: 7 + slot,
      z: 8,
      item: null,
      path: [],
      target: null,
      connected: true,
      action: 'idle',
    };
  }
  removeChef(id: string) {
    const chef = this.state.chefs[id];
    if (!chef) return;
    // Recovery inventory belongs to the shared pass counter, never to a new plate.
    if (chef.item) {
      const counter = this.station('counter');
      if (!counter.item) counter.item = chef.item;
      else counter.stock.push(chef.item);
      chef.item = null;
    }
    delete this.state.chefs[id];
  }
  private event(key: string) {
    this.state.event = { seq: this.state.event.seq + 1, key };
  }
  intent(id: string, intent: Intent) {
    const chef = this.state.chefs[id];
    if (!chef || !chef.connected || this.state.phase === 'finished') return;
    if (intent.type === 'pause') {
      this.state.phase = this.state.phase === 'paused' ? 'playing' : 'paused';
      return;
    }
    if (this.state.phase !== 'playing') return;
    if (intent.type === 'finish') {
      if (this.canWin()) this.finish();
      return;
    }
    if (intent.type === 'move') {
      if (!Number.isFinite(intent.x) || !Number.isFinite(intent.z)) return;
      const path = findPath(
        chef,
        { x: Math.round(intent.x), z: Math.round(intent.z) },
        this.blocked,
      );
      if (path) {
        chef.path = path;
        chef.target = null;
      } else this.event('blocked');
    } else if (intent.type === 'interact') {
      const station = this.state.stations.find((s) => s.id === intent.station);
      if (!station) return;
      const paths = neighbors(station)
        .map((p) => findPath(chef, p, this.blocked))
        .filter((p): p is Point[] => p !== null)
        .sort((a, b) => a.length - b.length);
      if (!paths.length) {
        this.event('blocked');
        return;
      }
      chef.path = paths[0];
      chef.target = station.id;
      if (!chef.path.length) {
        chef.target = null;
        this.interact(chef, station);
      }
    }
  }
  private interact(c: Chef, s: Station) {
    if (this.state.phase !== 'playing' || Math.hypot(c.x - s.x, c.z - s.z) > 1.05) return;
    const hand = c.item;
    const take = () => {
      c.item = s.item;
      s.item = null;
      s.phase = 'idle';
      s.elapsed = 0;
      s.progress = 0;
      this.event('picked');
    };
    const put = () => {
      s.item = c.item;
      c.item = null;
      this.event('placed');
    };
    c.action = s.kind;
    switch (s.kind) {
      case 'dispenser':
        if (!hand) {
          c.item = this.item(s.ingredient!);
          this.event('picked');
          return;
        }
        break;
      case 'counter':
        if (!hand && s.item) {
          take();
          s.item = s.stock.shift() ?? null;
          return;
        }
        if (hand && !s.item) {
          put();
          return;
        }
        break;
      case 'rack':
        if (!hand && s.stock.length) {
          c.item = s.stock.pop()!;
          this.event('picked');
          return;
        }
        if (hand?.kind === 'plate' && !hand.parts.length) {
          s.stock.push(hand);
          c.item = null;
          this.event('placed');
          return;
        }
        break;
      case 'board':
      case 'stove': {
        const step = this.content.recipes
          .flatMap((id) => recipeById(id).steps)
          .find((step) => step.station === s.id && step.inputs[0] === hand?.kind);
        if (!s.item && hand && step) {
          put();
          s.phase = 'processing';
          s.process = { output: step.output, taps: step.taps, seconds: step.seconds };
          s.elapsed = 0;
          s.progress = 0;
          return;
        }
        if (!hand && s.item && s.phase === 'processing' && s.process?.taps) {
          s.progress++;
          this.event('chop');
          if (s.progress >= s.process.taps) {
            s.item.kind = s.process.output;
            s.phase = 'ready';
            this.event('chopped');
          }
          return;
        }
        if (!hand && (s.phase === 'ready' || s.phase === 'burnt')) {
          take();
          return;
        }
        break;
      }
      case 'assembly':
        if (!s.item && hand?.kind === 'plate') {
          put();
          return;
        }
        if (
          s.item?.kind === 'plate' &&
          hand &&
          this.content.recipes.some((id) => {
            const r = recipeById(id);
            return (
              r.components.includes(hand.kind) &&
              s.item!.parts.every((p) => r.components.includes(p))
            );
          }) &&
          !s.item.parts.includes(hand.kind)
        ) {
          s.item.parts.push(hand.kind);
          c.item = null;
          this.event('assembled');
          const complete = this.content.recipes
            .map(recipeById)
            .find(
              (r) =>
                r.components.length === s.item!.parts.length &&
                r.components.every((k) => s.item!.parts.includes(k)),
            );
          if (complete) {
            s.item.kind = complete.steps.at(-1)!.output;
            this.event('dishReady');
          }
          return;
        }
        if (!hand && s.item) {
          take();
          return;
        }
        break;
      case 'seat': {
        const customer = this.state.customers.find((c) => c.seat === s.id);
        const recipe = customer ? recipeById(customer.recipe) : undefined;
        if (!hand && s.item?.kind === 'dirtyPlate') {
          take();
          this.admit();
          return;
        }
        if (
          hand &&
          recipe &&
          hand.kind === recipe.steps.at(-1)!.output &&
          customer?.state === 'WaitingForFood' &&
          customer.patience > 0 &&
          customer.recipe === recipe.id
        ) {
          c.item = null;
          s.item = hand;
          customer.state = 'Eating';
          customer.timer = recipe.eatSeconds;
          this.state.served++;
          this.state.combo += customerTypes[customer.type ?? 'regular'].combo;
          this.state.bestCombo = Math.max(this.state.combo, this.state.bestCombo);
          const bonus =
            1 + Math.min(this.config.maxComboBonus, (this.state.combo - 1) * this.config.comboStep);
          this.state.score += Math.round(
            (recipe.baseScore * customerTypes[customer.type ?? 'regular'].score +
              (this.config.speedBonus * customer.patience) / customer.maxPatience) *
              bonus,
          );
          this.serviceTotal += customer.maxPatience - customer.patience;
          this.event('served');
          return;
        }
        break;
      }
      case 'sink':
        if (!s.item && hand?.kind === 'dirtyPlate') {
          put();
          s.phase = 'processing';
          s.elapsed = 0;
          return;
        }
        if (!hand && s.phase === 'ready' && s.item) {
          take();
          return;
        }
        break;
      case 'trash':
        if (hand && !['plate', 'dirtyPlate'].includes(hand.kind) && !dishRecipe(hand.kind)) {
          c.item = null;
          this.event('discarded');
          return;
        }
        break;
    }
    this.event('invalid');
  }
  private spawn() {
    if (this.state.customers.filter((c) => !c.seat).length >= this.config.queueLimit) return;
    const type = this.content.customers[this.guestSerial++ % this.content.customers.length];
    const recipe = type === 'complex' ? this.content.recipes.at(-1)! : this.content.recipes[0];
    this.state.customers.push({
      type,
      id: `guest-${++this.serial}`,
      seat: null,
      state: 'Arriving',
      patience: this.config.queuePatience,
      maxPatience: this.config.queuePatience,
      timer: 0.5,
      recipe,
    });
  }
  private admit() {
    for (const seat of this.state.stations.filter((s) => s.kind === 'seat')) {
      if (seat.item || this.state.customers.some((c) => c.seat === seat.id)) continue;
      const c = this.state.customers.find((c) => c.state === 'Queueing');
      if (!c) break;
      c.seat = seat.id;
      c.state = 'Seated';
      c.timer = 0.5;
      c.patience = this.config.patience * customerTypes[c.type ?? 'regular'].patience;
      c.maxPatience = c.patience;
    }
  }
  tick(dt: number) {
    if (this.state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    const delta = Math.min(dt, this.state.remaining);
    this.state.remaining = Math.max(0, this.state.remaining - delta);
    this.state.elapsed += delta;
    // Expirations are resolved before interactions, including on the last frame.
    if (this.state.remaining <= 0) {
      this.finish();
      return;
    }
    for (const c of [...this.state.customers]) {
      if (
        c.state === 'Arriving' ||
        c.state === 'Seated' ||
        c.state === 'Eating' ||
        c.state === 'Leaving'
      ) {
        c.timer -= delta;
        if (c.timer <= 0) {
          if (c.state === 'Arriving') c.state = 'Queueing';
          else if (c.state === 'Seated') c.state = 'WaitingForFood';
          else if (c.state === 'Eating') {
            c.state = 'Leaving';
            c.timer = 0.5;
          } else {
            const s = this.station(c.seat!);
            if (s.item) {
              s.item.kind = 'dirtyPlate';
              s.item.parts = [];
            }
            this.removeCustomer(c);
          }
        }
      } else {
        c.patience -= delta;
        if (c.patience <= 0) {
          this.state.missed++;
          this.state.combo = 0;
          this.removeCustomer(c);
          this.event('customerLeft');
        }
      }
    }
    this.spawnClock += delta;
    if (this.spawnClock >= this.config.spawnSeconds) {
      this.spawnClock -= this.config.spawnSeconds;
      this.spawn();
    }
    this.admit();
    for (const s of this.state.stations) {
      if (
        s.process &&
        !s.process.taps &&
        s.item &&
        (s.phase === 'processing' || s.phase === 'ready')
      ) {
        s.elapsed += delta;
        const cookTime = s.process.seconds;
        s.progress = Math.min(1, s.elapsed / cookTime);
        if (s.elapsed >= cookTime + this.config.burnSeconds) {
          s.item.kind = 'burnt';
          s.phase = 'burnt';
          this.event('burnt');
        } else if (s.elapsed >= cookTime && s.phase === 'processing') {
          s.item.kind = s.process.output;
          s.phase = 'ready';
          this.event('foodReady');
        }
      }
      if (s.kind === 'sink' && s.phase === 'processing' && s.item) {
        s.elapsed += delta;
        s.progress = Math.min(1, s.elapsed / this.config.washSeconds);
        if (s.elapsed >= this.config.washSeconds) {
          s.item.kind = 'plate';
          s.phase = 'ready';
          this.event('washed');
        }
      }
    }
    for (const chef of Object.values(this.state.chefs)) {
      if (!chef.connected) continue;
      let distance = this.config.moveSpeed * delta;
      while (chef.path.length && distance > 0) {
        const p = chef.path[0],
          dx = p.x - chef.x,
          dz = p.z - chef.z,
          d = Math.hypot(dx, dz);
        if (d <= distance) {
          chef.x = p.x;
          chef.z = p.z;
          chef.path.shift();
          distance -= d;
        } else {
          chef.x += (dx / d) * distance;
          chef.z += (dz / d) * distance;
          distance = 0;
        }
      }
      if (!chef.path.length && chef.target) {
        const target = chef.target;
        chef.target = null;
        this.interact(chef, this.station(target));
      }
    }
  }
  private removeCustomer(c: Customer) {
    this.state.customers.splice(this.state.customers.indexOf(c), 1);
  }
  canWin() {
    return (
      this.state.score >= this.config.targetScore && this.state.served >= this.config.targetOrders
    );
  }
  private finish() {
    if (this.state.result) return;
    const won = this.canWin(),
      average = this.state.served ? this.serviceTotal / this.state.served : 0;
    let stars = won ? 1 : 0;
    if (won && this.state.score >= this.config.stars[1]) stars = 2;
    if (
      won &&
      this.state.score >= this.config.stars[2] &&
      this.state.missed <= this.config.maxMissedThreeStars &&
      average <= this.config.maxAverageServiceThreeStars &&
      this.state.bestCombo >= this.config.minComboThreeStars
    )
      stars = 3;
    this.state.result = {
      levelId: this.content.id,
      won,
      stars,
      score: this.state.score,
      served: this.state.served,
      missed: this.state.missed,
      bestCombo: this.state.bestCombo,
      averageService: average,
      duration: this.state.elapsed,
      matchId: this.matchId,
    };
    this.state.phase = 'finished';
    Object.values(this.state.chefs).forEach((c) => {
      c.path = [];
      c.target = null;
    });
    this.event(won ? 'won' : 'lost');
  }
}
