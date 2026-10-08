import { recipeSchema } from './index';
import type { StationDefinition } from '../../shared/src/types';

/** Validate the executable subset: one-item processors and one plate assembly DAG. */
export function validateRecipeGraph(
  value: unknown,
  stations: StationDefinition[],
  itemIds: Set<string>,
) {
  const r = recipeSchema.parse(value);
  const steps = new Map(r.steps.map((s) => [s.id, s]));
  const terminal = r.steps.filter((s) => s.station === 'assembly');
  if (terminal.length !== 1 || r.steps.at(-1) !== terminal[0])
    throw new Error('One final assembly required');
  if (new Set(r.steps.map((s) => s.output)).size !== r.steps.length)
    throw new Error('Ambiguous output');
  if (new Set(r.components).size !== r.components.length) throw new Error('Duplicate component');
  if (
    terminal[0].inputs.length !== r.components.length + 1 ||
    !terminal[0].inputs.includes('plate') ||
    !r.components.every((c) => terminal[0].inputs.includes(c))
  )
    throw new Error('Assembly components mismatch');
  const ancestors = (id: string): Set<string> =>
    new Set(steps.get(id)!.dependsOn.flatMap((d) => [d, ...ancestors(d)]));
  const sources = new Set(stations.filter((s) => s.kind === 'dispenser').map((s) => s.ingredient));
  sources.add('plate');
  for (const step of r.steps) {
    const station = stations.find((s) => s.id === step.station);
    if (!station || !['board', 'stove', 'assembly'].includes(station.kind))
      throw new Error('Missing processor');
    if (!itemIds.has(step.output) || step.inputs.some((i) => i !== 'plate' && !itemIds.has(i)))
      throw new Error('Unknown item');
    if (station.kind === 'assembly') {
      if (step.seconds || step.taps) throw new Error('Assembly must be instant');
    } else if (
      step.inputs.length !== 1 ||
      (station.kind === 'board'
        ? step.taps < 1 || step.seconds !== 0
        : step.seconds <= 0 || step.taps !== 0)
    )
      throw new Error('Unsupported process');
    for (const input of step.inputs) {
      if (sources.has(input)) continue;
      const producer = r.steps.find((s) => s.output === input);
      if (!producer || !ancestors(step.id).has(producer.id))
        throw new Error('Missing input dependency');
    }
  }
  const used = ancestors(terminal[0].id);
  if (used.size !== r.steps.length - 1) throw new Error('Unused branch');
  return r;
}
