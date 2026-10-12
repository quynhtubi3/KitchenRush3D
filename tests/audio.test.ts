import { afterEach, expect, it, vi } from 'vitest';
import { KitchenAudio } from '../apps/client/src/audio';
import { defaultPreferences } from '../apps/client/src/preferences';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('defers audio creation until unlock, separates volume channels and silences hidden tabs', () => {
  vi.useFakeTimers();
  const document = { hidden: false, addEventListener: vi.fn() };
  vi.stubGlobal('document', document);
  const gains: Array<{ gain: { setTargetAtTime: ReturnType<typeof vi.fn> } }> = [];
  const param = () => ({
    value: 0,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(() => {
      const node = {
        gain: param(),
        connect: vi.fn((destination) => destination),
        disconnect: vi.fn(),
      };
      gains.push(node);
      return node;
    }),
    createOscillator: vi.fn(() => ({
      frequency: param(),
      connect: vi.fn((destination) => destination),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      type: 'sine',
      onended: null,
    })),
  };
  const created = vi.fn();
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        created();
        return context;
      }
    },
  );
  const audio = new KitchenAudio();
  const settings = {
    ...defaultPreferences(),
    muted: false,
    masterVolume: 0.4,
    musicVolume: 0.2,
    sfxVolume: 0.7,
  };
  audio.configure(settings);
  audio.setTheme('tide');
  audio.play('served');
  expect(created).not.toHaveBeenCalled();
  audio.unlock();
  expect(created).toHaveBeenCalledTimes(1);
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 0, 0.02);
  expect(gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, 0, 0.02);
  expect(gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.7, 0, 0.02);
  vi.advanceTimersByTime(100);
  audio.play('served');
  expect(context.createOscillator).toHaveBeenCalledTimes(2);
  document.hidden = true;
  document.addEventListener.mock.calls[0][1]();
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.02);
  vi.advanceTimersByTime(1000);
  audio.play('served');
  expect(context.createOscillator).toHaveBeenCalledTimes(2);
  document.hidden = false;
  audio.configure({ ...settings, muted: true });
  audio.play('served');
  expect(context.createOscillator).toHaveBeenCalledTimes(2);
});

it('keeps play available when Web Audio is unavailable', () => {
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        throw new Error('Audio unavailable');
      }
    },
  );
  const audio = new KitchenAudio();
  expect(() => {
    audio.unlock();
    audio.play('served');
  }).not.toThrow();
});

it('loads small CC0 action samples only after unlock and plays them through the SFX bus', async () => {
  vi.useFakeTimers();
  const document = { hidden: false, addEventListener: vi.fn() };
  vi.stubGlobal('document', document);
  const started: Array<{ args: unknown[]; node: { onended: (() => void) | null } }> = [];
  const buffer = { duration: 1 } as AudioBuffer;
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn().mockResolvedValue(buffer),
    createGain: vi.fn(() => ({
      gain: {
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn((destination) => destination),
      disconnect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => {
      const node = {
        buffer: null,
        playbackRate: { value: 1 },
        onended: null as (() => void) | null,
        connect: vi.fn((destination) => destination),
        disconnect: vi.fn(),
        start: vi.fn((...args: unknown[]) => started.push({ args, node })),
      };
      return node;
    }),
    createOscillator: vi.fn(),
  };
  const fetchAsset = vi
    .fn()
    .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  vi.stubGlobal('fetch', fetchAsset);
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context;
      }
    },
  );

  const audio = new KitchenAudio();
  audio.configure({ ...defaultPreferences(), muted: false, musicVolume: 0 });
  audio.play('chop');
  expect(fetchAsset).not.toHaveBeenCalled();
  audio.unlock();
  await vi.waitFor(() => expect(fetchAsset).toHaveBeenCalledTimes(6));
  await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(6));
  await vi.waitFor(() => expect(audio.loadedSampleCount).toBe(6));
  audio.play('chop');
  expect(started).toHaveLength(1);
  expect(started[0].args[1]).toBe(0);
  expect(started[0].args[2]).toBe(0.46);
  expect(context.createOscillator).not.toHaveBeenCalled();
});
