import type { Snapshot } from '../../../../packages/shared/src/types';

/** Presentation only. First snapshots and reconnect gaps establish a baseline. */
export class Presentation {
  private signatures = new Map<string, string>();
  private until = new Map<string, number>();
  private level = '';
  private elapsed = -1;
  update(state: Snapshot) {
    const baseline =
      this.elapsed < 0 ||
      this.level !== state.levelId ||
      state.elapsed < this.elapsed ||
      state.elapsed - this.elapsed > 2;
    const next = new Map<string, string>();
    for (const s of state.stations)
      next.set(`station:${s.id}`, `${s.phase}:${s.progress}:${s.item?.id}:${s.item?.kind}`);
    for (const c of Object.values(state.chefs))
      next.set(`chef:${c.id}`, `${c.action}:${c.item?.id}:${c.item?.kind}`);
    for (const c of state.customers) next.set(`guest:${c.id}`, c.state);
    if (baseline) this.until.clear();
    else if (state.phase === 'playing')
      for (const [id, signature] of next)
        if (this.signatures.has(id) && this.signatures.get(id) !== signature)
          this.until.set(id, state.elapsed + 0.7);
    for (const [id, until] of this.until)
      if (!next.has(id) || until <= state.elapsed) this.until.delete(id);
    this.signatures = next;
    this.level = state.levelId ?? '';
    this.elapsed = state.elapsed;
  }
  pulse(id: string) {
    return Math.max(0, Math.min(1, ((this.until.get(id) ?? 0) - this.elapsed) / 0.7));
  }
}

export const effectBudget = (low: boolean, reduced: boolean, touch = false) =>
  reduced ? 0 : low ? 6 : touch ? 12 : 24;
