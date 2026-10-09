import { defaultPreferences, type Preferences } from './preferences';

// Original procedural motifs: no downloaded recordings or licensed songs.
const themes: Record<string, { root: number; seconds: number; notes: number[] }> = {
  menu: { root: 261.63, seconds: 0.42, notes: [0, 4, 7, 12, 7, 4, 2, 7] },
  'little-sun': { root: 293.66, seconds: 0.36, notes: [0, 7, 9, 4, 2, 7, 4, 9] },
  tide: { root: 220, seconds: 0.5, notes: [0, 2, 7, 9, 7, 2, 4, 7] },
  olive: { root: 246.94, seconds: 0.4, notes: [0, 4, 7, 4, 5, 9, 7, 2] },
  lantern: { root: 196, seconds: 0.33, notes: [0, 3, 7, 10, 7, 5, 3, 7] },
  orbit: { root: 329.63, seconds: 0.3, notes: [0, 7, 12, 2, 9, 4, 7, 14] },
};
export class KitchenAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private preferences = defaultPreferences();
  private theme = 'menu';
  private lastSfx = new Map<string, number>();
  private note = 0;
  private nextNote = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  get enabled() {
    return !this.preferences.muted;
  }
  configure(value: Preferences) {
    this.preferences = { ...value };
    this.updateGains();
  }
  setTheme(theme: string) {
    if (this.theme === theme) return;
    this.theme = themes[theme] ? theme : 'menu';
    this.note = 0;
    this.nextNote = 0;
  }
  private updateGains() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master?.gain.setTargetAtTime(
      this.preferences.muted || document.hidden ? 0 : this.preferences.masterVolume,
      now,
      0.02,
    );
    this.music?.gain.setTargetAtTime(this.preferences.musicVolume, now, 0.02);
    this.sfx?.gain.setTargetAtTime(this.preferences.sfxVolume, now, 0.02);
  }
  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.music = this.context.createGain();
        this.sfx = this.context.createGain();
        this.music.connect(this.master);
        this.sfx.connect(this.master);
        this.master.connect(this.context.destination);
        document.addEventListener('visibilitychange', () => this.updateGains());
      }
      this.updateGains();
      void this.context.resume().catch(() => undefined);
      this.timer ??= setInterval(() => this.musicTick(), 100);
    } catch {
      /* Audio is optional. */
    }
  }
  private musicTick() {
    if (
      !this.context ||
      !this.music ||
      this.context.state !== 'running' ||
      !this.enabled ||
      document.hidden ||
      this.preferences.musicVolume === 0
    )
      return;
    const now = this.context.currentTime;
    if (now < this.nextNote) return;
    const theme = themes[this.theme];
    const oscillator = this.context.createOscillator(),
      gain = this.context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value =
      theme.root * 2 ** (theme.notes[this.note++ % theme.notes.length] / 12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + theme.seconds * 0.85);
    oscillator.connect(gain).connect(this.music);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + theme.seconds);
    this.nextNote = now + theme.seconds;
  }
  play(key: string) {
    if (!this.enabled || !this.context || !this.sfx || document.hidden) return;
    const frequencies: Record<string, number> = {
      picked: 440,
      cooking: 120,
      washing: 380,
      mixing: 260,
      assembled: 560,
      customerWarning: 510,
      burnWarning: 280,
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
    if (now - (this.lastSfx.get(key) ?? -10) < 0.09) return;
    this.lastSfx.set(key, now);
    const oscillator = this.context.createOscillator(),
      gain = this.context.createGain();
    oscillator.type = ['chop', 'cooking'].includes(key) ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(f, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      f *
        (['chop', 'burnt', 'lost', 'cooking'].includes(key) ? 0.55 : key === 'served' ? 1.5 : 1.25),
      now + 0.1,
    );
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    oscillator.connect(gain).connect(this.sfx);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start();
    oscillator.stop(now + 0.22);
  }
}
