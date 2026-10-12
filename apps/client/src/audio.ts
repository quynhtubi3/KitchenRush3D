import { defaultPreferences, type Preferences } from './preferences';

// Slow, sparse harmonies keep the synthesized fallback relaxed if a browser cannot decode MP3.
const themes: Record<string, { root: number; seconds: number; notes: number[] }> = {
  menu: { root: 220, seconds: 0.92, notes: [0, 4, 7, 4, 2, 7, 4, 2] },
  kitchen: { root: 196, seconds: 0.84, notes: [0, 7, 4, 9, 7, 4, 2, 4] },
};

const musicTracks: Record<string, string> = {
  menu: '/assets/audio/music/menu-calm-loop.mp3',
  kitchen: '/assets/audio/music/kitchen-chill-loop.mp3',
};

const fallbackChords: Record<string, number[][]> = {
  menu: [
    [0, 4, 7],
    [5, 9, 12],
    [0, 4, 7],
    [7, 11, 14],
  ],
  kitchen: [
    [0, 4, 7],
    [5, 9, 12],
    [7, 11, 14],
    [0, 4, 7],
  ],
};

const sfxPhrases: Record<
  string,
  { notes: (number | null)[]; duration: number; volume: number; wave: OscillatorType }
> = {
  chopped: { notes: [660, 880], duration: 0.12, volume: 0.026, wave: 'triangle' },
  mixing: { notes: [440, 554, 659], duration: 0.14, volume: 0.018, wave: 'sine' },
  teamRelay: { notes: [659, 880, 1174], duration: 0.16, volume: 0.025, wave: 'triangle' },
  foodReady: { notes: [587, 740, 988], duration: 0.19, volume: 0.023, wave: 'sine' },
  dishReady: { notes: [784, 988, 1318], duration: 0.18, volume: 0.022, wave: 'sine' },
  customerWarning: {
    notes: [null, 659, null, 659],
    duration: 0.11,
    volume: 0.022,
    wave: 'triangle',
  },
  burnWarning: {
    notes: [330, null, 294, null, 330],
    duration: 0.12,
    volume: 0.028,
    wave: 'triangle',
  },
  burnt: { notes: [392, 311, 196], duration: 0.15, volume: 0.032, wave: 'sawtooth' },
  customerLeft: { notes: [523, 392, 294], duration: 0.15, volume: 0.023, wave: 'sine' },
  won: { notes: [523, 659, 784, 1046], duration: 0.2, volume: 0.028, wave: 'triangle' },
  lost: { notes: [392, 330, 262, 196], duration: 0.21, volume: 0.025, wave: 'sine' },
};

const sfxCooldowns: Record<string, number> = {
  chop: 0.12,
  chopped: 0.12,
  cooking: 0.7,
  washing: 0.7,
  mixing: 0.16,
  customerWarning: 0.65,
  burnWarning: 0.55,
  washed: 0.14,
};

const sampleEffects: Record<
  string,
  { url: string; gain: number; duration: number; offset: number }
> = {
  picked: { url: '/assets/audio/pickup-soft.ogg', gain: 0.3, duration: 0.16, offset: 0 },
  placed: { url: '/assets/audio/plate-place.ogg', gain: 0.27, duration: 0.19, offset: 0 },
  chop: { url: '/assets/audio/chop.mp3', gain: 0.34, duration: 0.46, offset: 0 },
  cooking: { url: '/assets/audio/frying.mp3', gain: 0.22, duration: 0.62, offset: 0.2 },
  washing: { url: '/assets/audio/wash.mp3', gain: 0.2, duration: 0.58, offset: 0.1 },
  served: { url: '/assets/audio/serve-bell.ogg', gain: 0.29, duration: 0.32, offset: 0 },
  assembled: { url: '/assets/audio/plate-place.ogg', gain: 0.22, duration: 0.17, offset: 0.015 },
  washed: { url: '/assets/audio/plate-place.ogg', gain: 0.23, duration: 0.19, offset: 0.02 },
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
  private samples = new Map<string, AudioBuffer>();
  private musicBuffer: { theme: string; buffer: AudioBuffer } | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicTrackGain: GainNode | null = null;
  private musicSourceTheme = '';
  private musicLoadTheme = '';
  private musicLoadRequest = 0;
  private musicFetchAbort: AbortController | null = null;
  private failedMusicThemes = new Set<string>();
  private sampleLoadStarted = false;
  private activeSampleVoices = 0;
  get enabled() {
    return !this.preferences.muted;
  }
  get loadedSampleCount() {
    return this.samples.size;
  }
  configure(value: Preferences) {
    const wasMusicEnabled = this.musicAllowed();
    const wasEnabled = this.enabled;
    this.preferences = { ...value };
    this.updateGains();
    if (!wasEnabled && this.enabled) this.loadSamples();
    if (!this.musicAllowed()) this.stopMusicTrack(0.12);
    else if (!wasMusicEnabled) this.startMusicTrack();
  }
  setTheme(theme: string) {
    const nextTheme = theme === 'menu' ? 'menu' : 'kitchen';
    if (this.theme === nextTheme) return;
    this.theme = nextTheme;
    this.note = 0;
    this.nextNote = this.context ? this.context.currentTime + 0.06 : 0;
    this.musicLoadRequest++;
    this.musicFetchAbort?.abort();
    this.musicFetchAbort = null;
    this.musicLoadTheme = '';
    this.musicBuffer = null;
    if (this.musicAllowed()) this.startMusicTrack();
    else this.stopMusicTrack(0.22);
  }
  private musicAllowed() {
    return Boolean(
      this.context &&
      this.context.state === 'running' &&
      !this.preferences.muted &&
      !document.hidden &&
      this.preferences.masterVolume > 0 &&
      this.preferences.musicVolume > 0,
    );
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
        document.addEventListener('visibilitychange', () => {
          this.updateGains();
          if (document.hidden) this.stopMusicTrack(0.1);
          else this.startMusicTrack();
        });
      }
      this.updateGains();
      void this.context
        .resume()
        .then(() => this.startMusicTrack())
        .catch(() => undefined);
      if (this.enabled) this.loadSamples();
      this.timer ??= setInterval(() => this.musicTick(), 50);
    } catch {
      /* Audio is optional. */
    }
  }
  private loadSamples() {
    if (this.sampleLoadStarted || !this.context || !this.context.decodeAudioData) return;
    this.sampleLoadStarted = true;
    for (const url of new Set(Object.values(sampleEffects).map(({ url }) => url))) {
      void fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`Audio asset unavailable: ${url}`);
          return response.arrayBuffer();
        })
        .then((data) => this.context?.decodeAudioData(data))
        .then((buffer) => {
          if (buffer) this.samples.set(url, buffer);
        })
        .catch(() => undefined);
    }
  }
  private startMusicTrack() {
    const context = this.context;
    const theme = this.theme;
    const url = musicTracks[theme];
    if (!context || !this.musicAllowed() || !url || this.failedMusicThemes.has(theme)) return;
    if (this.musicSourceTheme === theme && this.musicSource) return;
    if (this.musicLoadTheme === theme) return;
    if (this.musicBuffer?.theme === theme) {
      this.beginMusicTrack(theme, this.musicBuffer.buffer);
      return;
    }

    const request = ++this.musicLoadRequest;
    const abort = new AbortController();
    this.musicFetchAbort = abort;
    this.musicLoadTheme = theme;
    void fetch(url, { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Music asset unavailable: ${url}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        if (request !== this.musicLoadRequest || this.theme !== theme) return;
        this.musicFetchAbort = null;
        this.musicLoadTheme = '';
        this.musicBuffer = { theme, buffer };
        if (this.musicAllowed()) this.beginMusicTrack(theme, buffer);
      })
      .catch(() => {
        if (request !== this.musicLoadRequest) return;
        this.musicFetchAbort = null;
        this.musicLoadTheme = '';
        this.failedMusicThemes.add(theme);
        if (this.musicSourceTheme !== theme) this.stopMusicTrack(0.25);
        this.nextNote = context.currentTime + 0.06;
      });
  }
  private beginMusicTrack(theme: string, buffer: AudioBuffer) {
    const context = this.context,
      destination = this.music;
    if (!context || !destination || !this.musicAllowed()) return;
    const now = context.currentTime;
    this.stopMusicTrack(0.75);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.48, now + 1.1);
    source.connect(gain).connect(destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.musicSource === source) {
        this.musicSource = null;
        this.musicTrackGain = null;
        this.musicSourceTheme = '';
      }
    };
    this.musicSource = source;
    this.musicTrackGain = gain;
    this.musicSourceTheme = theme;
    source.start(now);
  }
  private stopMusicTrack(fadeSeconds: number) {
    const source = this.musicSource,
      gain = this.musicTrackGain,
      context = this.context;
    if (!source || !gain || !context) return;
    this.musicSource = null;
    this.musicTrackGain = null;
    this.musicSourceTheme = '';
    const now = context.currentTime;
    const fade = Math.max(0.02, fadeSeconds);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + fade);
    source.stop(now + fade + 0.03);
  }
  private musicTick() {
    if (
      !this.context ||
      !this.music ||
      this.context.state !== 'running' ||
      !this.enabled ||
      document.hidden ||
      this.preferences.musicVolume === 0 ||
      this.preferences.masterVolume === 0 ||
      this.musicSource ||
      (this.musicLoadTheme === this.theme && !this.failedMusicThemes.has(this.theme))
    )
      return;
    const now = this.context.currentTime;
    const lookAhead = now + 0.09;
    const theme = themes[this.theme];
    while (this.nextNote <= lookAhead) {
      const at = Math.max(now + 0.008, this.nextNote);
      const step = this.note++;
      const chord = fallbackChords[this.theme][Math.floor(step / 8) % 4];
      const lead = theme.notes[step % theme.notes.length];
      if (lead !== undefined && step % 2 === 0 && step % 8 !== 6) {
        this.playMusicTone(
          theme.root * 2 ** (lead / 12) * 2,
          at,
          theme.seconds * 0.7,
          step % 4 === 0 ? 0.008 : 0.005,
          'triangle',
        );
      }
      if (step % 8 === 0) {
        const bassNote = chord[0] - 12;
        this.playMusicTone(
          theme.root * 2 ** (bassNote / 12),
          at,
          theme.seconds * 3.2,
          0.009,
          'sine',
        );
      }
      if (step % 8 === 0) {
        for (const tone of chord) {
          this.playMusicTone(
            theme.root * 2 ** (tone / 12),
            at,
            theme.seconds * 6.5,
            0.0028,
            'triangle',
          );
        }
      }
      this.nextNote += theme.seconds;
    }
  }
  private playMusicTone(
    frequency: number,
    at: number,
    duration: number,
    volume: number,
    type: OscillatorType,
  ) {
    if (!this.context || !this.music) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, at + Math.max(0.06, duration));
    oscillator.connect(gain).connect(this.music);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + Math.max(0.08, duration));
  }
  private playSfxPhrase(
    phrase: { notes: (number | null)[]; duration: number; volume: number; wave: OscillatorType },
    now: number,
  ) {
    if (!this.context || !this.sfx) return;
    const spacing = phrase.duration * 0.72;
    for (const [index, frequency] of phrase.notes.entries()) {
      if (!frequency) continue;
      const start = now + index * spacing;
      const duration = phrase.duration * 1.15;
      try {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = phrase.wave;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(phrase.volume, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        oscillator.connect(gain).connect(this.sfx);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + duration + 0.01);
      } catch {
        // A failed transient never interrupts input or game state.
      }
    }
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
      teamRelay: 1174,
      foodReady: 740,
      dishReady: 990,
      washed: 600,
      burnt: 130,
      customerLeft: 160,
      won: 1046,
      lost: 220,
      catMeow: 590,
      catPurr: 115,
    };
    const f = frequencies[key];
    if (!f) return;
    const now = this.context.currentTime;
    if (now - (this.lastSfx.get(key) ?? -10) < (sfxCooldowns[key] ?? 0.14)) return;
    this.lastSfx.set(key, now);
    if (key === 'catMeow' || key === 'catPurr') {
      try {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        const duration = key === 'catMeow' ? 0.38 : 0.42;
        oscillator.type = key === 'catMeow' ? 'triangle' : 'sine';
        if (key === 'catMeow') {
          oscillator.frequency.setValueAtTime(500, now);
          oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.12);
          oscillator.frequency.exponentialRampToValueAtTime(420, now + duration);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.045, now + 0.035);
          gain.gain.setValueAtTime(0.036, now + 0.16);
          gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        } else {
          oscillator.frequency.setValueAtTime(118, now);
          oscillator.frequency.exponentialRampToValueAtTime(88, now + duration);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.018, now + 0.06);
          gain.gain.setValueAtTime(0.014, now + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        }
        oscillator.connect(gain).connect(this.sfx);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(now);
        oscillator.stop(now + duration);
        return;
      } catch {
        // Audio remains optional on browsers that block oscillator playback.
      }
    }
    const phrase = sfxPhrases[key];
    if (phrase) {
      this.playSfxPhrase(phrase, now);
      return;
    }
    const sample = sampleEffects[key];
    const buffer = sample && this.samples.get(sample.url);
    if (sample && buffer && this.activeSampleVoices < 10) {
      try {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        const duration = Math.min(sample.duration, buffer.duration);
        const offset = Math.min(sample.offset, Math.max(0, buffer.duration - duration));
        source.buffer = buffer;
        source.playbackRate.value = 0.96 + Math.random() * 0.08;
        gain.gain.setValueAtTime(sample.gain, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        source.connect(gain).connect(this.sfx);
        this.activeSampleVoices++;
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
          this.activeSampleVoices = Math.max(0, this.activeSampleVoices - 1);
        };
        source.start(now, offset, duration);
        return;
      } catch {
        // Unsupported codec or browser audio node: keep the synthesized fallback below.
      }
    }
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
