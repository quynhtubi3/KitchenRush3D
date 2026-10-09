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
