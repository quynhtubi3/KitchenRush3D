/** Sustainably paced rendering, independent of Retina resolution and server simulation. */
export function renderFrameRate(touch: boolean, quality: string, playing: boolean) {
  if (!playing) return 15;
  return touch ? (quality === 'high' ? 60 : quality === 'low' ? 24 : 30) : 60;
}

export class RenderCadence {
  private due = 0;
  private previous = -1;
  reset() {
    this.due = 0;
    this.previous = -1;
  }
  step(now: number, fps: number, hidden = false): number | null {
    if (hidden) {
      this.reset();
      return null;
    }
    if (now + 0.4 < this.due) return null;
    const first = this.previous < 0;
    const dt = first ? 1000 / fps : Math.max(0, now - this.previous);
    this.previous = now;
    const interval = 1000 / fps;
    this.due = first || now - this.due > interval ? now + interval : this.due + interval;
    return dt;
  }
}

export class ShadowCadence {
  private previous = -Infinity;
  update(map: { refreshRate: number; resetRefreshCounter(): void }, now: number, limited: boolean) {
    const rate = limited ? 0 : 1;
    // Babylon's setter resets its refresh counter even when assigned the same value.
    if (map.refreshRate !== rate) map.refreshRate = rate;
    if (limited && now - this.previous >= 100) {
      map.resetRefreshCounter();
      this.previous = now;
    }
  }
}
