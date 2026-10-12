import type { Snapshot, Station } from '../../../packages/shared/src/types';
import { dishRecipe, recipeById } from '../../../packages/content/src/campaign';
import { approach } from './tap-navigation';

export type Guidance = {
  customer: string;
  station: string | null;
  missing: string[];
  action: 'take' | 'put' | 'prep' | 'serve' | 'wait';
};
export function guidance(state: Snapshot, chefId: string, tracked?: string): Guidance | null {
  const chef = state.chefs[chefId];
  const orders = state.customers.filter((c) => c.seat && c.state === 'WaitingForFood');
  const assembly = state.stations.find((s) => s.kind === 'assembly');
  const heldRecipe = chef?.item ? dishRecipe(chef.item.kind) : undefined;
  const boundRecipe =
    heldRecipe?.id ?? chef?.item?.assemblyRecipe ?? assembly?.item?.assemblyRecipe;
  const boundOrder = boundRecipe ? orders.find((c) => c.recipe === boundRecipe) : undefined;
  const customer = boundOrder ?? orders.find((c) => c.id === tracked) ?? orders[0];
  if (!chef || !customer || state.phase !== 'playing' || state.countdown) return null;
  if (heldRecipe && !boundOrder) return null;
  const recipe = recipeById(boundRecipe ?? customer.recipe);
  const parts =
    heldRecipe?.components ??
    (chef.item?.kind === 'plate' ? chef.item.parts : assembly?.item?.parts) ??
    [];
  const missing = recipe.components.filter((k) => !parts.includes(k));
  const result = (station: Station | undefined, action: Guidance['action']): Guidance => ({
    customer: customer.id,
    station: station?.id ?? null,
    missing,
    action,
  });
  const others = Object.values(state.chefs).filter((c) => c.id !== chefId && c.connected);
  const free = (s: Station) =>
    !others.some(
      (c) =>
        c.target === s.id ||
        (c.path.length > 0 && Math.hypot(c.path.at(-1)!.x - s.x, c.path.at(-1)!.z - s.z) <= 1.05),
    );
  const reachable = (s: Station) => free(s) && approach(state, chefId, s) !== null;
  const choose = (predicate: (s: Station) => boolean) =>
    state.stations.find((s) => predicate(s) && reachable(s));
  const held = chef.item;
  if (held) {
    if (held.kind === recipe.steps.at(-1)!.output)
      return result(
        choose((s) => s.id === customer.seat),
        'serve',
      );
    if (held.kind === 'burnt')
      return result(
        choose((s) => s.kind === 'trash'),
        'put',
      );
    if (held.kind === 'dirtyPlate')
      return result(
        choose((s) => s.kind === 'sink' && !s.item),
        'put',
      );
    if (
      assembly &&
      reachable(assembly) &&
      ((!assembly.item && held.kind === 'plate') ||
        (assembly.item?.kind === 'plate' &&
          missing.includes(held.kind) &&
          parts.every((p) => recipe.components.includes(p))))
    )
      return result(assembly, 'put');
    const step = recipe.steps.find((s) => s.station !== 'assembly' && s.inputs.includes(held.kind));
    const destination = step && choose((s) => s.id === step.station && !s.item);
    return result(destination || choose((s) => s.kind === 'counter' && !s.item), 'put');
  }
  if (assembly?.item?.kind === recipe.steps.at(-1)!.output && reachable(assembly))
    return result(assembly, 'take');
  if (!assembly?.item) {
    const plate = choose(
      (s) =>
        (s.kind === 'rack' && s.stock.length > 0) ||
        (s.item?.kind === 'plate' && (s.kind === 'counter' || s.phase === 'ready')),
    );
    if (plate && !others.some((c) => c.item?.kind === 'plate')) return result(plate, 'take');
    const dirty = choose((s) => s.item?.kind === 'dirtyPlate' && s.kind !== 'sink');
    if (dirty) return result(dirty, 'take');
  }
  // Follow producer edges backwards. Existing work or a teammate's inventory
  // satisfies that branch; independent branches remain candidates.
  const visiting = new Set<string>();
  const next = (kind: string): Guidance | null => {
    if (visiting.has(kind)) return null;
    visiting.add(kind);
    if (others.some((c) => c.item?.kind === kind)) return null;
    const ready = choose(
      (s) => s.item?.kind === kind && (s.kind === 'counter' || s.phase === 'ready'),
    );
    if (ready) return result(ready, 'take');
    const producer = recipe.steps.find((s) => s.output === kind && s.station !== 'assembly');
    if (producer) {
      const station = state.stations.find((s) => s.id === producer.station);
      if (!station || !reachable(station)) return null;
      if (station.item) {
        if (
          station.phase === 'processing' &&
          station.process?.output === kind &&
          station.process.taps
        )
          return result(station, 'prep');
        return null;
      }
      for (const input of producer.inputs) {
        const hint = next(input);
        if (hint) return hint;
      }
      return null;
    }
    const source = choose((s) => s.kind === 'dispenser' && s.ingredient === kind);
    return source ? result(source, 'take') : null;
  };
  if (assembly?.item && assembly.item.kind !== 'plate') return result(undefined, 'wait');
  for (const kind of missing) {
    const hint = next(kind);
    if (hint) return hint;
  }
  return result(undefined, 'wait');
}
