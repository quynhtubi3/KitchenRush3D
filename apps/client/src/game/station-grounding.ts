import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { StationDefinition } from '../../../../packages/shared/src/types';

export const openTableSupport = { height: 0.81, centerY: 0.405, offset: 0.39 } as const;
export const isOpenWorktable = (kind: string) =>
  ['board', 'sink', 'rack', 'counter'].includes(kind);
const materials = new WeakMap<Scene, PBRMaterial>();

/** Ground the four table feet with one room-wide batch, including when map shadows are off. */
export function stationContacts(
  scene: Scene,
  stations: readonly StationDefinition[],
  furniture = false,
) {
  const open = stations.filter((station) => isOpenWorktable(station.kind));
  if (!open.length && !furniture) return null;
  let material = materials.get(scene);
  if (!material) {
    material = new PBRMaterial('soft table-foot contact', scene);
    material.albedoColor = new Color3(0.23, 0.2, 0.18);
    material.unlit = true;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    material.backFaceCulling = false;
    materials.set(scene, material);
  }
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const vertex = (x: number, z: number, alpha: number) => {
    positions.push(x, 0.006, z);
    normals.push(0, 1, 0);
    colors.push(1, 1, 1, alpha);
  };
  for (const station of open)
    for (const x of [-openTableSupport.offset, openTableSupport.offset])
      for (const z of [-openTableSupport.offset, openTableSupport.offset]) {
        const cx = station.x - 7 + x,
          cz = station.z - 5 + z,
          start = positions.length / 3;
        vertex(cx, cz, 0.23);
        for (let i = 0; i < 16; i++) {
          const angle = (i * Math.PI * 2) / 16;
          vertex(cx + Math.cos(angle) * 0.16, cz + Math.sin(angle) * 0.16, 0);
        }
        for (let i = 0; i < 16; i++) indices.push(start, start + 1 + ((i + 1) % 16), start + 1 + i);
      }
  if (furniture) {
    // Cabinet bases and wall-floor transitions join the same batch/material.
    for (const station of stations.filter((s) => !isOpenWorktable(s.kind))) {
      const cx = station.x - 7,
        cz = station.z - 5,
        start = positions.length / 3;
      vertex(cx, cz, 0.2);
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI * 2) / 16;
        vertex(cx + Math.cos(angle) * 0.52, cz + Math.sin(angle) * 0.48, 0);
      }
      for (let i = 0; i < 16; i++) indices.push(start, start + 1 + ((i + 1) % 16), start + 1 + i);
    }
    const strip = (
      x0: number,
      z0: number,
      x1: number,
      z1: number,
      x2: number,
      z2: number,
      x3: number,
      z3: number,
    ) => {
      const start = positions.length / 3;
      vertex(x0, z0, 0.23);
      vertex(x1, z1, 0.23);
      vertex(x2, z2, 0);
      vertex(x3, z3, 0);
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    };
    strip(-7.4, -5.28, 7.4, -5.28, -7.4, -5.04, 7.4, -5.04);
    strip(-7.42, -5.1, -7.42, 5.4, -7.2, -5.1, -7.2, 5.4);
  }
  const mesh = new Mesh('station floor contacts', scene),
    data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  mesh.metadata = { visualOnly: true };
  return mesh;
}
