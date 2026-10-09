import type { Snapshot, Station, Customer } from '../../../packages/shared/src/types';
export function customerUrgent(c: Customer) {
  return (
    (c.state === 'WaitingForFood' || c.state === 'Queueing') &&
    c.patience > 0 &&
    c.patience <= Math.min(20, c.maxPatience * 0.25)
  );
}
export function stationFeedback(s: Station, burnSeconds: number): 'burn-soon' | 'ready' | null {
  if (s.phase !== 'ready') return null;
  if (
    s.kind === 'stove' &&
    s.elapsed >= (s.process?.seconds ?? 7) + burnSeconds - Math.min(5, burnSeconds * 0.35)
  )
    return 'burn-soon';
  return 'ready';
}
export class FeedbackCues {
  private seen = new Set<string>();
  private processing = new Set<string>();
  private elapsed = -1;
  reset() {
    this.seen.clear();
    this.processing.clear();
    this.elapsed = -1;
  }
  update(state: Snapshot, burnSeconds: number): string[] {
    const active = new Map<string, string>();
    if (state.phase === 'playing') {
      for (const c of state.customers)
        if (customerUrgent(c)) active.set(`customer:${c.id}`, 'customerWarning');
      for (const s of state.stations) {
        const cue = stationFeedback(s, burnSeconds);
        if (cue)
          active.set(
            `${s.id}:${s.item?.id}:${cue}`,
            cue === 'burn-soon' ? 'burnWarning' : s.kind === 'sink' ? 'washed' : 'foodReady',
          );
      }
    }
    if (state.phase === 'paused') return [];
    const cues = [
      ...new Set([...active].filter(([key]) => !this.seen.has(key)).map(([, cue]) => cue)),
    ];
    const processing = new Set<string>();
    for (const s of state.stations) {
      if (s.phase !== 'processing') continue;
      const key = `${s.id}:${s.item?.id}`;
      processing.add(key);
      if (
        state.phase === 'playing' &&
        this.elapsed >= 0 &&
        state.elapsed - this.elapsed <= 2 &&
        !this.processing.has(key)
      )
        cues.push(s.kind === 'sink' ? 'washing' : s.kind === 'stove' ? 'cooking' : 'mixing');
    }
    this.processing = processing;
    this.elapsed = state.elapsed;
    this.seen = new Set(active.keys());
    return cues;
  }
}
