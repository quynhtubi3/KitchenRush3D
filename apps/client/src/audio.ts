export class KitchenAudio {
  private context: AudioContext | null = null;
  enabled = false;
  unlock() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
    } catch {
      /* Audio is optional. */
    }
  }
  play(key: string) {
    if (!this.enabled || !this.context) return;
    const frequencies: Record<string, number> = {
      picked: 440,
      placed: 330,
      chop: 180,
      chopped: 660,
      served: 880,
      foodReady: 740,
      dishReady: 990,
      washed: 600,
      burnt: 130,
      customerLeft: 160,
      won: 1046,
      lost: 220,
    };
    const f = frequencies[key];
    if (!f) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator(),
      gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(f, now);
    oscillator.frequency.exponentialRampToValueAtTime(f * 1.25, now + 0.1);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(now + 0.22);
  }
}
