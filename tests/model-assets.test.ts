import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { ModelAssetLibrary } from '../apps/client/src/game/model-assets';

function minimalGlb() {
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0', generator: 'Kitchen Rush asset pipeline test' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'Test kitchen prop' }],
    }),
  );
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, jsonLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  return bytes;
}

describe('optional cached GLB assets', () => {
  it('loads once, creates independent scene instances, and disposes them', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const library = new ModelAssetLibrary(scene);
    const source = minimalGlb();
    try {
      const [firstTemplate, secondTemplate] = await Promise.all([
        library.load('test-prop', source),
        library.load('test-prop', source),
      ]);
      expect(firstTemplate).toBe(secondTemplate);
      expect(library.cachedAssetCount).toBe(1);

      const first = await library.instantiate('test-prop', source);
      const second = await library.instantiate('test-prop', source);
      expect(first.root).not.toBe(second.root);
      expect(library.liveInstanceCount).toBe(2);
      library.disposeInstance(first);
      expect(library.liveInstanceCount).toBe(1);
      library.dispose();
      expect(library.liveInstanceCount).toBe(0);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
