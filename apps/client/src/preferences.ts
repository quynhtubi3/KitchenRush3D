export type Preferences = {
  muted: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: 'standard' | 'low' | 'high';
  sharpness: 'auto' | 'css' | 'native';
  renderDebug: boolean;
  showAllStationLabels: boolean;
  guidance: boolean;
  tapInteraction: 'arrival' | 'confirm';
  reducedMotion: boolean;
  touchControls: 'tap' | 'joystick';
};
export const PREFERENCES_KEY = 'kr-preferences-v1';
export function defaultPreferences(reducedMotion = false): Preferences {
  return {
    muted: true,
    masterVolume: 0.7,
    musicVolume: 0.35,
    sfxVolume: 0.8,
    quality: 'standard',
    sharpness: 'auto',
    renderDebug: false,
    showAllStationLabels: false,
    guidance: true,
    tapInteraction: 'arrival',
    reducedMotion,
    touchControls: 'tap',
  };
}
export function parsePreferences(raw: string | null, reducedMotion = false): Preferences {
  const defaults = defaultPreferences(reducedMotion);
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const volume = (key: string, fallback: number) =>
      typeof value[key] === 'number' && Number.isFinite(value[key])
        ? Math.max(0, Math.min(1, value[key]))
        : fallback;
    return {
      muted: typeof value.muted === 'boolean' ? value.muted : defaults.muted,
      masterVolume: volume('masterVolume', defaults.masterVolume),
      musicVolume: volume('musicVolume', defaults.musicVolume),
      sfxVolume: volume('sfxVolume', defaults.sfxVolume),
      quality: value.quality === 'low' || value.quality === 'high' ? value.quality : 'standard',
      sharpness:
        value.sharpness === 'css' || value.sharpness === 'native' ? value.sharpness : 'auto',
      renderDebug: value.renderDebug === true,
      showAllStationLabels: value.showAllStationLabels === true,
      guidance: value.guidance !== false,
      tapInteraction: value.tapInteraction === 'confirm' ? 'confirm' : 'arrival',
      reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : reducedMotion,
      touchControls: value.touchControls === 'joystick' ? 'joystick' : 'tap',
    };
  } catch {
    return defaults;
  }
}
export function loadPreferences(): Preferences {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    return parsePreferences(localStorage.getItem(PREFERENCES_KEY), reduced);
  } catch {
    return defaultPreferences(reduced);
  }
}
export function savePreferences(value: Preferences): boolean {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
