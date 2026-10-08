import { z } from 'zod';
import type { StationDefinition } from '../../shared/src/types';

const stepSchema = z.object({
  id: z.string(),
  station: z.string(),
  inputs: z.array(z.string()),
  output: z.string(),
  dependsOn: z.array(z.string()),
  seconds: z.number().nonnegative(),
  taps: z.number().int().nonnegative(),
});
export const recipeSchema = z
  .object({
    id: z.string(),
    name: z.object({ vi: z.string(), en: z.string() }),
    steps: z.array(stepSchema).min(1),
    components: z.array(z.string()).min(1),
    eatSeconds: z.number().positive(),
    baseScore: z.number().positive(),
  })
  .superRefine((recipe, ctx) => {
    const steps = new Map(recipe.steps.map((s) => [s.id, s]));
    if (steps.size !== recipe.steps.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate recipe step' });
    const visiting = new Set<string>(),
      visited = new Set<string>();
    function visit(id: string) {
      if (visiting.has(id)) {
        ctx.addIssue({ code: 'custom', message: 'Recipe dependency cycle' });
        return;
      }
      if (visited.has(id)) return;
      const step = steps.get(id);
      if (!step) {
        ctx.addIssue({ code: 'custom', message: `Missing dependency ${id}` });
        return;
      }
      visiting.add(id);
      step.dependsOn.forEach(visit);
      visiting.delete(id);
      visited.add(id);
    }
    recipe.steps.forEach((s) => visit(s.id));
  });
export const burger = recipeSchema.parse({
  id: 'sunshine-burger',
  name: { vi: 'Burger Nắng Mai', en: 'Sunshine burger' },
  components: ['bun', 'cookedMeat', 'choppedLettuce'],
  eatSeconds: 6,
  baseScore: 100,
  steps: [
    {
      id: 'grill',
      station: 'stove',
      inputs: ['meat'],
      output: 'cookedMeat',
      dependsOn: [],
      seconds: 7,
      taps: 0,
    },
    {
      id: 'chop',
      station: 'board',
      inputs: ['lettuce'],
      output: 'choppedLettuce',
      dependsOn: [],
      seconds: 0,
      taps: 3,
    },
    {
      id: 'assemble',
      station: 'assembly',
      inputs: ['plate', 'bun', 'cookedMeat', 'choppedLettuce'],
      output: 'burger',
      dependsOn: ['grill', 'chop'],
      seconds: 0,
      taps: 0,
    },
  ],
});
export const levelSchema = z.object({
  id: z.string(),
  duration: z.number().positive(),
  targetScore: z.number().positive(),
  targetOrders: z.number().int().positive(),
  plates: z.number().int().positive(),
  patience: z.number().positive(),
  queuePatience: z.number().positive(),
  queueLimit: z.number().int().positive(),
  spawnSeconds: z.number().positive(),
  washSeconds: z.number().positive(),
  burnSeconds: z.number().positive(),
  moveSpeed: z.number().positive(),
  comboStep: z.number().nonnegative(),
  maxComboBonus: z.number().nonnegative(),
  speedBonus: z.number().nonnegative(),
  stars: z.tuple([z.number(), z.number(), z.number()]),
  maxMissedThreeStars: z.number().int().nonnegative(),
  maxAverageServiceThreeStars: z.number().positive(),
  minComboThreeStars: z.number().int().positive(),
});
export const level = levelSchema.parse({
  id: 'little-sun-01',
  duration: 180,
  targetScore: 220,
  targetOrders: 2,
  plates: 2,
  patience: 105,
  queuePatience: 65,
  queueLimit: 3,
  spawnSeconds: 24,
  washSeconds: 5,
  burnSeconds: 14,
  moveSpeed: 5,
  comboStep: 0.15,
  maxComboBonus: 0.75,
  speedBonus: 40,
  stars: [220, 440, 680],
  maxMissedThreeStars: 1,
  maxAverageServiceThreeStars: 55,
  minComboThreeStars: 3,
});
export const map = { width: 15, height: 11 };
export const stations: StationDefinition[] = [
  { id: 'meat', kind: 'dispenser', ingredient: 'meat', x: 2, z: 1 },
  { id: 'stove', kind: 'stove', x: 4, z: 1 },
  { id: 'lettuce', kind: 'dispenser', ingredient: 'lettuce', x: 6, z: 1 },
  { id: 'board', kind: 'board', x: 8, z: 1 },
  { id: 'bun', kind: 'dispenser', ingredient: 'bun', x: 10, z: 1 },
  { id: 'rack', kind: 'rack', x: 1, z: 4 },
  { id: 'sink', kind: 'sink', x: 1, z: 6 },
  { id: 'trash', kind: 'trash', x: 1, z: 8 },
  { id: 'assembly', kind: 'assembly', x: 6, z: 5 },
  { id: 'counter', kind: 'counter', x: 8, z: 5 },
  { id: 'seat1', kind: 'seat', x: 12, z: 4 },
  { id: 'seat2', kind: 'seat', x: 12, z: 7 },
];
export function validateContent() {
  recipeSchema.parse(burger);
  levelSchema.parse(level);
  const ids = new Set<string>(),
    tiles = new Set<string>();
  for (const s of stations) {
    const tile = `${s.x},${s.z}`;
    if (
      ids.has(s.id) ||
      tiles.has(tile) ||
      s.x < 1 ||
      s.z < 1 ||
      s.x >= map.width - 1 ||
      s.z >= map.height - 1
    )
      throw new Error('Invalid station layout');
    ids.add(s.id);
    tiles.add(tile);
  }
  for (const step of burger.steps)
    if (!stations.some((s) => s.kind === step.station)) throw new Error('Missing recipe station');
}
validateContent();
