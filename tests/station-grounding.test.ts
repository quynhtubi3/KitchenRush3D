import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { levels } from '../packages/content/src/campaign';
import {
  isOpenWorktable,
  openTableSupport,
  stationContacts,
} from '../apps/client/src/game/station-grounding';

it('grounds all campaign worktables without extra textures or interactive geometry', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    // The existing room has PBR materials already; warm Babylon's shared BRDF texture.
    new PBRMaterial('existing room material', scene);
    const feetBottom = openTableSupport.centerY - openTableSupport.height / 2;
    expect(feetBottom).toBeCloseTo(0, 8);
    let sharedMaterial: unknown;
    for (const level of levels) {
      const original = JSON.stringify(level.stations);
      const textureCount = scene.textures.length;
      const patch = stationContacts(scene, level.stations);
      expect(patch).not.toBeNull();
      expect(patch!.isPickable).toBe(false);
      expect(patch!.hasVertexAlpha).toBe(true);
      if (sharedMaterial) expect(patch!.material).toBe(sharedMaterial);
      sharedMaterial = patch!.material;
      const p = patch!.getVerticesData(VertexBuffer.PositionKind)!;
      const color = patch!.getVerticesData(VertexBuffer.ColorKind)!;
      const stations = level.stations.filter((s) => isOpenWorktable(s.kind));
      // Every vertex stays just above the floor and within its actual support's station tile.
      for (let vertex = 0; vertex < p.length / 3; vertex++) {
        const station = stations[Math.floor(vertex / (4 * 17))];
        expect(p[vertex * 3 + 1]).toBeGreaterThan(0);
        expect(p[vertex * 3 + 1]).toBeLessThan(0.01);
        expect(Math.abs(p[vertex * 3] - (station.x - 7))).toBeLessThan(0.57);
        expect(Math.abs(p[vertex * 3 + 2] - (station.z - 5))).toBeLessThan(0.57);
        expect(color[vertex * 4 + 3]).toBeGreaterThanOrEqual(0);
        expect(color[vertex * 4 + 3]).toBeLessThanOrEqual(0.24);
      }
      expect(scene.textures.length).toBe(textureCount);
      expect(JSON.stringify(level.stations)).toBe(original);
      patch!.dispose();
      expect(scene.meshes).toHaveLength(0);
      expect(scene.materials.filter((m) => m.name === 'soft table-foot contact')).toHaveLength(1);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it('batches cabinet and wall contacts with table contacts without textures or scene growth', () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    new PBRMaterial('existing room', scene);
    const textures = scene.textures.length;
    for (const level of levels) {
      const original = JSON.stringify(level.stations);
      const patch = stationContacts(scene, level.stations, true)!;
      expect(patch.isPickable).toBe(false);
      const positions = patch.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < positions.length; i += 3) {
        expect(positions[i]).toBeGreaterThanOrEqual(-7.5);
        expect(positions[i]).toBeLessThanOrEqual(7.5);
        expect(positions[i + 1]).toBeCloseTo(0.006);
        expect(positions[i + 2]).toBeGreaterThanOrEqual(-5.5);
        expect(positions[i + 2]).toBeLessThanOrEqual(5.5);
      }
      expect(scene.textures.length).toBe(textures);
      expect(JSON.stringify(level.stations)).toBe(original);
      patch.dispose();
      expect(scene.meshes).toHaveLength(0);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
