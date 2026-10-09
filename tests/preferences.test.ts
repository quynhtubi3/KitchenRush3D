import { describe, expect, it } from 'vitest';
import { parsePreferences } from '../apps/client/src/preferences';

describe('device preferences recovery', () => {
  it('preserves legacy quality and explicitly selected Retina settings without enabling Low', () => {
    expect(parsePreferences('{"quality":"standard"}')).toMatchObject({
      quality: 'standard',
      sharpness: 'auto',
      renderDebug: false,
      showAllStationLabels: false,
    });
    expect(
      parsePreferences('{"quality":"high","sharpness":"native","renderDebug":true}'),
    ).toMatchObject({
      quality: 'high',
      sharpness: 'native',
      renderDebug: true,
      showAllStationLabels: false,
    });
    expect(parsePreferences('{"showAllStationLabels":true}')).toMatchObject({
      showAllStationLabels: true,
    });
    expect(
      parsePreferences('{"quality":"unknown","sharpness":"unknown","renderDebug":"true"}'),
    ).toMatchObject({ quality: 'standard', sharpness: 'auto', renderDebug: false });
  });
  it('recovers from unavailable or corrupted data and honors OS reduced motion', () => {
    for (const raw of [null, '{broken', 'null', '4']) {
      expect(parsePreferences(raw, true)).toMatchObject({
        muted: true,
        quality: 'standard',
        reducedMotion: true,
      });
    }
  });
  it('bounds volume and rejects values of the wrong type from storage', () => {
    expect(
      parsePreferences(
        JSON.stringify({
          masterVolume: -9,
          musicVolume: 10,
          sfxVolume: 'loud',
          quality: 'ultra',
          muted: 'false',
        }),
      ),
    ).toMatchObject({
      masterVolume: 0,
      musicVolume: 1,
      sfxVolume: 0.8,
      quality: 'standard',
      muted: true,
    });
  });
  it('preserves an explicit reduced-motion choice when the OS default differs', () => {
    expect(
      parsePreferences('{"reducedMotion":false,"quality":"low","muted":false}', true),
    ).toMatchObject({
      reducedMotion: false,
      quality: 'low',
      muted: false,
    });
  });
});
