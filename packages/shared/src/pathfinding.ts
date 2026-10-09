import type { Point } from './types';
import { map } from '../../content/src/index';
export const key = (p: Point) => `${p.x},${p.z}`;
export const neighbors = (p: Point): Point[] => [
  { x: p.x + 1, z: p.z },
  { x: p.x - 1, z: p.z },
  { x: p.x, z: p.z + 1 },
  { x: p.x, z: p.z - 1 },
];
export const walkable = (p: Point, blocked: Set<string>) =>
  p.x >= 1 && p.z >= 2 && p.x < map.width - 1 && p.z < map.height - 1 && !blocked.has(key(p));
export function findPath(start: Point, goal: Point, blocked: Set<string>): Point[] | null {
  const origin = { x: Math.round(start.x), z: Math.round(start.z) };
  if (!walkable(goal, blocked)) return null;
  const queue = [origin],
    parents = new Map<string, Point | null>([[key(origin), null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (key(p) === key(goal)) {
      const path: Point[] = [];
      let c: Point | null = p;
      while (c && key(c) !== key(origin)) {
        path.unshift(c);
        c = parents.get(key(c)) ?? null;
      }
      // Return through the tile center when changing direction halfway through a step.
      if (Math.hypot(start.x - origin.x, start.z - origin.z) > 0.001) path.unshift(origin);
      return path;
    }
    for (const n of neighbors(p))
      if (walkable(n, blocked) && !parents.has(key(n))) {
        parents.set(key(n), p);
        queue.push(n);
      }
  }
  return null;
}
