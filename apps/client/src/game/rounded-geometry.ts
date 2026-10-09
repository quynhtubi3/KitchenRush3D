import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';

/** Six rounded faces with outward normals and Babylon left-handed front winding. */
export function roundedGeometry(w: number, h: number, d: number, radius: number): VertexData {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const bevel = Math.min(radius, w * 0.45, h * 0.45, d * 0.45);
  const half = [w / 2, h / 2, d / 2];
  const faces = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  const segments = roundedBoxSegments(w, h, d, bevel);
  for (const face of faces) {
    const first = positions.length / 3;
    for (let iy = 0; iy <= segments; iy++)
      for (let ix = 0; ix <= segments; ix++) {
        const a = (ix / segments - 0.5) * 2,
          b = (iy / segments - 0.5) * 2;
        const point = [0, 1, 2].map(
          (axis) =>
            face.n[axis] * half[axis] +
            face.u[axis] * half[axis] * a +
            face.v[axis] * half[axis] * b,
        );
        const inner = point.map((value, axis) =>
          Math.max(-half[axis] + bevel, Math.min(half[axis] - bevel, value)),
        );
        const delta = point.map((value, axis) => value - inner[axis]);
        const length = Math.hypot(...delta) || 1;
        const normal = delta.map((value) => value / length);
        positions.push(...inner.map((value, axis) => value + normal[axis] * bevel));
        normals.push(...normal);
        uvs.push(ix / segments, iy / segments);
      }
    const stride = segments + 1;
    for (let iy = 0; iy < segments; iy++)
      for (let ix = 0; ix < segments; ix++) {
        const a = first + iy * stride + ix,
          b = a + 1,
          c = a + stride,
          e = c + 1;
        indices.push(a, e, b, a, c, e);
      }
  }
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;

  return data;
}

/** MergeMeshes transforms source data: cached templates must own no live mesh backing arrays. */
export function copyGeometry(data: VertexData): VertexData {
  const instance = new VertexData();
  instance.positions = Array.from(data.positions!);
  instance.normals = Array.from(data.normals!);
  instance.uvs = Array.from(data.uvs!);
  instance.indices = Array.from(data.indices!);
  return instance;
}
import { roundedBoxSegments } from './geometry-budget';
