import type { Intent } from '../../../../packages/shared/src/types';
export function parseIntent(payload: unknown): Intent | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (
    p.type === 'move' &&
    typeof p.x === 'number' &&
    typeof p.z === 'number' &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.z)
  )
    return { type: 'move', x: p.x, z: p.z };
  if (p.type === 'interact' && typeof p.station === 'string' && p.station.length < 40)
    return { type: 'interact', station: p.station };
  if (p.type === 'selectRecipe' && typeof p.recipe === 'string' && p.recipe.length < 80)
    return { type: 'selectRecipe', recipe: p.recipe };
  if (p.type === 'finish' || p.type === 'pause') return { type: p.type };
  return null;
}
