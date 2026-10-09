import type { Intent, Point, Snapshot, Station } from '../../../packages/shared/src/types';
import { findPath, key, neighbors } from '../../../packages/shared/src/pathfinding';

// Preview chooses a reachable approach tile; the server still computes and owns movement.
export function approach(state: Snapshot, id: string, station: Station): Point | null {
  const chef = state.chefs[id];
  if (!chef) return null;
  const blocked = new Set(state.stations.map(key));
  const candidates = neighbors(station)
    .map((goal) => ({ goal, path: findPath(chef, goal, blocked) }))
    .filter((entry) => entry.path !== null)
    .sort((a, b) => a.path!.length - b.path!.length);
  return candidates[0]?.goal ?? null;
}

export class TapNavigation {
  pending: {
    station: string;
    goal: Point;
    item: string;
    stationItem: string;
    at: number;
    automatic: boolean;
  } | null = null;
  private lastStation = '';
  private lastTap = -Infinity;
  cancel() {
    this.pending = null;
  }
  select(
    state: Snapshot,
    id: string,
    stationId: string,
    now: number,
    automatic = true,
  ): Intent | null {
    const chef = state.chefs[id];
    const station = state.stations.find((s) => s.id === stationId);
    if (!chef || !station || !chef.connected || state.phase !== 'playing' || state.countdown)
      return null;
    if (stationId === this.lastStation && now - this.lastTap < 300) return null;
    this.lastStation = stationId;
    this.lastTap = now;
    if (this.pending?.station === stationId) return null;
    this.cancel();
    const goal = approach(state, id, station);
    if (!goal) return null;
    if (!chef.path.length && Math.hypot(chef.x - station.x, chef.z - station.z) <= 1.05)
      return { type: 'interact', station: stationId };
    this.pending = {
      station: stationId,
      goal,
      item: chef.item?.id ?? '',
      stationItem: station.item?.id ?? '',
      at: now,
      automatic,
    };
    return { type: 'move', ...goal };
  }
  receive(state: Snapshot, id: string, now: number): Intent | null {
    const pending = this.pending;
    if (!pending) return null;
    const chef = state.chefs[id];
    const station = state.stations.find((s) => s.id === pending.station);
    if (
      !chef ||
      !station ||
      !chef.connected ||
      state.phase !== 'playing' ||
      now - pending.at > 15000 ||
      (chef.item?.id ?? '') !== pending.item ||
      (station.item?.id ?? '') !== pending.stationItem
    ) {
      this.cancel();
      return null;
    }
    if (chef.path.length || Math.hypot(chef.x - pending.goal.x, chef.z - pending.goal.z) > 0.01)
      return null;
    this.cancel();
    return pending.automatic && Math.hypot(chef.x - station.x, chef.z - station.z) <= 1.05
      ? { type: 'interact', station: station.id }
      : null;
  }
}
