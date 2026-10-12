import { z } from 'zod';
import { burger, level, levelSchema, recipeSchema, stations } from './index';
import type { Result, StationDefinition } from '../../shared/src/types';
import { validateRecipeGraph } from './validation';

const name = z.object({ vi: z.string().min(1), en: z.string().min(1) });
export const itemSchema = z.object({
  id: z.string().min(1),
  name,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export const items = new Map<string, z.infer<typeof itemSchema>>();
function item(id: string, vi: string, en: string, color: string) {
  items.set(id, itemSchema.parse({ id, name: { vi, en }, color }));
  return id;
}
item('meat', 'Thịt', 'Meat', '#dd826e');
item('cookedMeat', 'Thịt chín', 'Cooked meat', '#824b33');
item('lettuce', 'Rau xà lách', 'Lettuce', '#76ad56');
item('choppedLettuce', 'Rau đã cắt', 'Chopped lettuce', '#76ad56');
item('bun', 'Bánh mì', 'Bun', '#efbb59');
item('toast', 'Bánh nướng', 'Toast', '#c78b43');
item('burger', 'Burger Nắng Mai', 'Sunshine burger', '#efbb59');
item('deluxe-burger', 'Burger bánh nướng', 'Toasted burger', '#c78b43');

export const customerTypes = {
  regular: { name: { vi: 'Khách thường', en: 'Regular' }, patience: 1, score: 1, combo: 1 },
  vip: { name: { vi: 'VIP', en: 'VIP' }, patience: 1.15, score: 1.5, combo: 1 },
  impatient: { name: { vi: 'Vội vã', en: 'Impatient' }, patience: 0.72, score: 1.2, combo: 1 },
  complex: {
    name: { vi: 'Đơn cầu kỳ', en: 'Complex order' },
    patience: 1.35,
    score: 1.3,
    combo: 1,
  },
  combo: { name: { vi: 'Thưởng combo', en: 'Combo bonus' }, patience: 1, score: 1, combo: 2 },
} as const;
export type CustomerType = keyof typeof customerTypes;
const customerSchema = z.object({
  name,
  patience: z.number().positive(),
  score: z.number().positive(),
  combo: z.number().int().positive(),
});
Object.values(customerTypes).forEach((c) => customerSchema.parse(c));

export const recipes = [burger];
const deluxe = recipeSchema.parse({
  ...burger,
  id: 'toasted-burger',
  name: { vi: 'Burger bánh nướng', en: 'Toasted burger' },
  components: ['toast', 'cookedMeat', 'choppedLettuce'],
  baseScore: 130,
  steps: [
    ...burger.steps.slice(0, 2),
    {
      id: 'toast',
      station: 'oven',
      inputs: ['bun'],
      output: 'toast',
      dependsOn: [],
      seconds: 4,
      taps: 0,
    },
    {
      id: 'assemble',
      station: 'assembly',
      inputs: ['plate', 'toast', 'cookedMeat', 'choppedLettuce'],
      output: 'deluxe-burger',
      dependsOn: ['grill', 'chop', 'toast'],
      seconds: 0,
      taps: 0,
    },
  ],
});
recipes.push(deluxe);

function addRecipe(value: unknown) {
  const parsed = recipeSchema.parse(value);
  recipes.push(parsed);
  return parsed;
}

// Little Sun teaches one new action at a time before the complete menu opens.
const cheese = item('cheese', 'Phô mai', 'Cheese', '#f2c64c');
const slicedCheese = item('slicedCheese', 'Phô mai lát', 'Sliced cheese', '#ffd85c');
const chicken = item('chicken', 'Thịt gà sống', 'Raw chicken', '#e69a83');
const friedChicken = item('friedChicken', 'Gà giòn', 'Crispy chicken', '#bf7040');
const potato = item('potato', 'Khoai tây', 'Potato', '#c99b62');
const cutPotato = item('cutPotato', 'Khoai tây cắt', 'Cut potato', '#e6bd78');
const cookedFries = item('cookedFries', 'Khoai tây vàng giòn', 'Golden fries', '#edbd54');
item('fries', 'Khoai tây chiên', 'French fries', '#edbd54');
const cheeseBurger = addRecipe({
  id: 'sunshine-cheeseburger',
  name: { vi: 'Burger Phô Mai Nắng Mai', en: 'Sunshine cheeseburger' },
  components: ['bun', 'cookedMeat', 'choppedLettuce', slicedCheese],
  eatSeconds: 7,
  baseScore: 125,
  steps: [
    ...burger.steps.slice(0, 2),
    {
      id: 'slice-cheese',
      station: 'board',
      inputs: [cheese],
      output: slicedCheese,
      dependsOn: [],
      seconds: 0,
      taps: 2,
    },
    {
      id: 'assemble',
      station: 'assembly',
      inputs: ['plate', 'bun', 'cookedMeat', 'choppedLettuce', slicedCheese],
      output: 'cheeseburger',
      dependsOn: ['grill', 'chop', 'slice-cheese'],
      seconds: 0,
      taps: 0,
    },
  ],
});
item('cheeseburger', 'Burger phô mai', 'Cheeseburger', '#d9a84e');
const chickenBurger = addRecipe({
  id: 'sunshine-chicken-burger',
  name: { vi: 'Burger Gà Giòn', en: 'Crispy chicken burger' },
  components: ['bun', friedChicken, 'choppedLettuce'],
  eatSeconds: 7,
  baseScore: 135,
  steps: [
    {
      id: 'fry-chicken',
      station: 'stove',
      inputs: [chicken],
      output: friedChicken,
      dependsOn: [],
      seconds: 8,
      taps: 0,
    },
    { ...burger.steps[1] },
    {
      id: 'assemble',
      station: 'assembly',
      inputs: ['plate', 'bun', friedChicken, 'choppedLettuce'],
      output: 'chicken-burger',
      dependsOn: ['fry-chicken', 'chop'],
      seconds: 0,
      taps: 0,
    },
  ],
});
item('chicken-burger', 'Burger gà giòn', 'Chicken burger', '#d28a4d');
addRecipe({
  id: 'sunshine-fries',
  name: { vi: 'Khoai tây chiên Nắng Mai', en: 'Sunshine fries' },
  components: [cookedFries],
  eatSeconds: 5,
  baseScore: 95,
  steps: [
    {
      id: 'cut-potato',
      station: 'board',
      inputs: [potato],
      output: cutPotato,
      dependsOn: [],
      seconds: 0,
      taps: 3,
    },
    {
      id: 'fry-potato',
      station: 'stove',
      inputs: [cutPotato],
      output: cookedFries,
      dependsOn: ['cut-potato'],
      seconds: 7,
      taps: 0,
    },
    {
      id: 'assemble',
      station: 'assembly',
      inputs: ['plate', cookedFries],
      output: 'fries',
      dependsOn: ['fry-potato'],
      seconds: 0,
      taps: 0,
    },
  ],
});

// Each cuisine has independent hot/cold branches and a premium branch with a second process.
const cuisines = [
  [
    'tide',
    'Cơm',
    'Rice',
    'Cơm chín',
    'Cooked rice',
    'Cá',
    'Fish',
    'Cá thái',
    'Sliced fish',
    'Rong biển',
    'Nori',
    'Rong nướng',
    'Toasted nori',
    'Sushi Thủy Triều',
    'Tide sushi',
    '#6797b0',
  ],
  [
    'olive',
    'Mì',
    'Pasta',
    'Mì luộc',
    'Boiled pasta',
    'Cà chua',
    'Tomato',
    'Sốt cà',
    'Tomato sauce',
    'Bánh dẹt',
    'Flatbread',
    'Bánh giòn',
    'Crisp bread',
    'Mì Vườn Ôliu',
    'Olive pasta',
    '#ba7956',
  ],
  [
    'lantern',
    'Mì gạo',
    'Rice noodles',
    'Mì xào',
    'Wok noodles',
    'Ớt ngọt',
    'Pepper',
    'Ớt cắt',
    'Diced pepper',
    'Đậu phụ',
    'Tofu',
    'Đậu nướng',
    'Grilled tofu',
    'Mì Đèn Lồng',
    'Lantern noodles',
    '#bf6551',
  ],
  [
    'orbit',
    'Đạm thực vật',
    'Plant protein',
    'Đạm áp chảo',
    'Seared protein',
    'Rau sao',
    'Star greens',
    'Rau trộn',
    'Mixed greens',
    'Bánh cầu',
    'Orb bread',
    'Bánh plasma',
    'Plasma bread',
    'Đĩa Quỹ Đạo',
    'Orbit bowl',
    '#9a85cb',
  ],
] as const;
for (const [id, av, ae, bv, be, cv, ce, dv, de, ev, ee, fv, fe, rv, re, color] of cuisines) {
  const a = item(`${id}-raw`, av, ae, color),
    b = item(`${id}-hot`, bv, be, color);
  const c = item(`${id}-green`, cv, ce, '#76ad56'),
    d = item(`${id}-cut`, dv, de, '#76ad56');
  const e = item(`${id}-side`, ev, ee, '#efbb59'),
    f = item(`${id}-crisp`, fv, fe, '#c78b43');
  for (const premium of [false, true]) {
    const output = item(
      `${id}-${premium ? 'premium' : 'dish'}`,
      rv + (premium ? ' đặc biệt' : ''),
      re + (premium ? ' special' : ''),
      color,
    );
    const components = [b, d, premium ? f : e];
    recipes.push(
      recipeSchema.parse({
        id: output,
        name: items.get(output)!.name,
        components,
        eatSeconds: 6 + (premium ? 2 : 0),
        baseScore: premium ? 140 : 110,
        steps: [
          {
            id: 'hot',
            station: 'stove',
            inputs: [a],
            output: b,
            dependsOn: [],
            seconds: 6,
            taps: 0,
          },
          {
            id: 'cold',
            station: 'board',
            inputs: [c],
            output: d,
            dependsOn: [],
            seconds: 0,
            taps: 3,
          },
          ...(premium
            ? [
                {
                  id: 'premium',
                  station: 'oven',
                  inputs: [e],
                  output: f,
                  dependsOn: [],
                  seconds: 5,
                  taps: 0,
                },
              ]
            : []),
          {
            id: 'assemble',
            station: 'assembly',
            inputs: ['plate', ...components],
            output,
            dependsOn: premium ? ['hot', 'cold', 'premium'] : ['hot', 'cold'],
            seconds: 0,
            taps: 0,
          },
        ],
      }),
    );
  }
}
const regionalSpecials = {
  tide: {
    a: {
      raw: ['Cá ngừ', 'Tuna'],
      cooked: ['Cá ngừ áp chảo', 'Seared tuna'],
      dish: ['Nigiri Cá Ngừ', 'Seared Tuna Nigiri'],
      color: '#d27b62',
    },
    b: ['Tempura Thủy Triều', 'Tide Tempura Roll'],
    c: {
      raw: ['Trứng cá', 'Roe'],
      prepared: ['Trứng cá trộn', 'Seasoned roe'],
      cooked: ['Nhân cuộn biển', 'Ocean roll filling'],
      dish: ['Cuộn Rồng Biển', 'Tide Dragon Roll'],
      color: '#df865c',
    },
  },
  olive: {
    a: {
      raw: ['Thịt gà', 'Chicken'],
      cooked: ['Gà sốt ôliu', 'Olive chicken'],
      dish: ['Mì Gà Sốt Ôliu', 'Olive Chicken Pasta'],
      color: '#d18e69',
    },
    b: ['Mì Bruschetta Ôliu', 'Olive Bruschetta Pasta'],
    c: {
      raw: ['Phô mai tươi', 'Fresh cheese'],
      prepared: ['Phô mai trộn', 'Seasoned cheese'],
      cooked: ['Phô mai nướng', 'Baked cheese'],
      dish: ['Mì Nướng Vườn Ôliu', 'Olive Garden Bake'],
      color: '#e2ba6a',
    },
  },
  lantern: {
    a: {
      raw: ['Thịt bò', 'Beef'],
      cooked: ['Bò xào cay', 'Spicy wok beef'],
      dish: ['Mì Bò Chảo Lửa', 'Fire Wok Beef Noodles'],
      color: '#c97b58',
    },
    b: ['Đậu Phụ Giòn Đèn Lồng', 'Lantern Crispy Tofu'],
    c: {
      raw: ['Vỏ hoành thánh', 'Dumpling wrappers'],
      prepared: ['Vỏ hoành thánh trộn', 'Seasoned wrappers'],
      cooked: ['Hoành thánh hấp', 'Roasted dumplings'],
      dish: ['Hoành Thánh Đèn Lồng', 'Lantern Dumplings'],
      color: '#d78d54',
    },
  },
  orbit: {
    a: {
      raw: ['Nấm thiên thạch', 'Meteor mushrooms'],
      cooked: ['Nấm áp chảo', 'Seared mushrooms'],
      dish: ['Tô Nấm Thiên Thạch', 'Meteor Mushroom Bowl'],
      color: '#a58ac2',
    },
    b: ['Bánh Sao Giòn', 'Orbit Star Crisp'],
    c: {
      raw: ['Rong sao', 'Comet greens'],
      prepared: ['Rong sao trộn', 'Seasoned comet greens'],
      cooked: ['Rong sao nướng', 'Roasted comet greens'],
      dish: ['Đĩa Siêu Tân Tinh', 'Supernova Platter'],
      color: '#67bfa3',
    },
  },
} as const;

// New recipes are assembled from independent, executable preparation branches.
for (const id of ['tide', 'olive', 'lantern', 'orbit'] as const) {
  const base = recipes.find((r) => r.id === `${id}-dish`)!;
  const [hot, cold] = base.steps;
  const side = base.components.find(
    (component) => !base.steps.some((step) => step.output === component),
  )!;
  const spec = regionalSpecials[id as keyof typeof regionalSpecials];
  const aRaw = item(`${id}-signature-raw`, spec.a.raw[0], spec.a.raw[1], spec.a.color);
  const aCooked = item(`${id}-signature-cooked`, spec.a.cooked[0], spec.a.cooked[1], spec.a.color);
  const aDish = item(`${id}-signature-plate`, spec.a.dish[0], spec.a.dish[1], spec.a.color);
  addRecipe({
    id: `${id}-signature-a`,
    name: { vi: spec.a.dish[0], en: spec.a.dish[1] },
    components: [hot.output, cold.output, aCooked],
    eatSeconds: 7,
    baseScore: 130,
    steps: [
      { ...hot, dependsOn: [...hot.dependsOn] },
      { ...cold, dependsOn: [...cold.dependsOn] },
      {
        id: 'signature',
        station: 'stove',
        inputs: [aRaw],
        output: aCooked,
        dependsOn: [],
        seconds: 8,
        taps: 0,
      },
      {
        id: 'assemble',
        station: 'assembly',
        inputs: ['plate', hot.output, cold.output, aCooked],
        output: aDish,
        dependsOn: [hot.id, cold.id, 'signature'],
        seconds: 0,
        taps: 0,
      },
    ],
  });

  const sidePrepared = item(`${id}-side-prepared`, 'Món phụ đã sơ chế', 'Prepared side', '#d8b36c');
  const sideCooked = item(`${id}-side-cooked`, 'Món phụ giòn', 'Crisped side', '#c58b4b');
  const bDish = item(`${id}-signature-b-plate`, spec.b[0], spec.b[1], '#d08e58');
  addRecipe({
    id: `${id}-signature-b`,
    name: { vi: spec.b[0], en: spec.b[1] },
    components: [hot.output, cold.output, sideCooked],
    eatSeconds: 8,
    baseScore: 145,
    steps: [
      { ...hot, dependsOn: [...hot.dependsOn] },
      { ...cold, dependsOn: [...cold.dependsOn] },
      {
        id: 'side-prep',
        station: 'board',
        inputs: [side],
        output: sidePrepared,
        dependsOn: [],
        seconds: 0,
        taps: 2,
      },
      {
        id: 'side-cook',
        station: 'stove',
        inputs: [sidePrepared],
        output: sideCooked,
        dependsOn: ['side-prep'],
        seconds: 5,
        taps: 0,
      },
      {
        id: 'assemble',
        station: 'assembly',
        inputs: ['plate', hot.output, cold.output, sideCooked],
        output: bDish,
        dependsOn: [hot.id, cold.id, 'side-cook'],
        seconds: 0,
        taps: 0,
      },
    ],
  });

  const cRaw = item(`${id}-late-raw`, spec.c.raw[0], spec.c.raw[1], spec.c.color);
  const cPrepared = item(
    `${id}-late-prepared`,
    spec.c.prepared[0],
    spec.c.prepared[1],
    spec.c.color,
  );
  const cCooked = item(`${id}-late-cooked`, spec.c.cooked[0], spec.c.cooked[1], spec.c.color);
  const cDish = item(`${id}-signature-c-plate`, spec.c.dish[0], spec.c.dish[1], spec.c.color);
  addRecipe({
    id: `${id}-signature-c`,
    name: { vi: spec.c.dish[0], en: spec.c.dish[1] },
    components: [hot.output, cold.output, cCooked],
    eatSeconds: 9,
    baseScore: 165,
    steps: [
      { ...hot, dependsOn: [...hot.dependsOn] },
      { ...cold, dependsOn: [...cold.dependsOn] },
      {
        id: 'late-mix',
        station: 'mixer',
        inputs: [cRaw],
        output: cPrepared,
        dependsOn: [],
        seconds: 0,
        taps: 2,
      },
      {
        id: 'late-roast',
        station: 'oven',
        inputs: [cPrepared],
        output: cCooked,
        dependsOn: ['late-mix'],
        seconds: 6,
        taps: 0,
      },
      {
        id: 'assemble',
        station: 'assembly',
        inputs: ['plate', hot.output, cold.output, cCooked],
        output: cDish,
        dependsOn: [hot.id, cold.id, 'late-roast'],
        seconds: 0,
        taps: 0,
      },
    ],
  });
}

// Premium sides require active preparation followed by unattended cooking.
// The hot and cold branches remain independent of this two-stage side branch.
for (const r of recipes.filter(
  (recipe) => recipe.id === 'toasted-burger' || recipe.id.endsWith('-premium'),
)) {
  const cooking = r.steps.find((s) => s.station === 'oven')!;
  const raw = items.get(cooking.inputs[0])!;
  const prepared = item(
    `${raw.id}-prepared`,
    `${raw.name.vi} đã trộn`,
    `Prepared ${raw.name.en.toLowerCase()}`,
    raw.color,
  );
  r.steps.splice(r.steps.length - 2, 0, {
    id: 'mix-side',
    station: 'mixer',
    inputs: [raw.id],
    output: prepared,
    dependsOn: [],
    seconds: 0,
    taps: 2,
  });
  cooking.inputs = [prepared];
  cooking.dependsOn = ['mix-side'];
}
export const recipeById = (id: string) => {
  const r = recipes.find((r) => r.id === id);
  if (!r) throw new Error(`Unknown recipe ${id}`);
  return r;
};
export const dishRecipe = (kind: string) => recipes.find((r) => r.steps.at(-1)!.output === kind);

/** Weighted server-side order selection; a customer never repeats the last dish when alternatives exist. */
export function pickOrderRecipe(
  menu: readonly string[],
  weights: readonly { recipeId: string; weight: number }[],
  previous: string | undefined,
  roll: number,
  complex = false,
) {
  if (!menu.length) throw new Error('Empty recipe menu');
  if (complex) {
    // Prefer the longest eligible graph, breaking ties toward later unlocks.
    // Excluding the last dish first prevents a one-recipe streak in narrow menus.
    const eligible = menu.length > 1 && previous ? menu.filter((id) => id !== previous) : [...menu];
    const longest = Math.max(...eligible.map((id) => recipeById(id).steps.length));
    return eligible.filter((id) => recipeById(id).steps.length === longest).at(-1)!;
  }
  const pool = menu.length > 1 && previous ? menu.filter((id) => id !== previous) : [...menu];
  const byId = new Map(weights.map(({ recipeId, weight }) => [recipeId, weight]));
  const total = pool.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
  if (!(total > 0)) throw new Error('Recipe weights do not cover menu');
  let cursor = Math.max(0, Math.min(0.999999999, roll)) * total;
  for (const id of pool) {
    cursor -= byId.get(id) ?? 0;
    if (cursor < 0) return id;
  }
  return pool.at(-1)!;
}

export const restaurants = [
  {
    id: 'little-sun',
    name: { vi: 'Quán Nắng Mai', en: 'Little Sun Diner' },
    color: '#437e72',
    equipment: { vi: ['Bếp nướng', 'Thớt', 'Lò bánh'], en: ['Grill', 'Chopping board', 'Toaster'] },
  },
  {
    id: 'tide',
    name: { vi: 'Sushi Thủy Triều', en: 'Tide Sushi House' },
    color: '#6797b0',
    equipment: {
      vi: ['Nồi cơm', 'Bàn thái cá', 'Lò rong biển'],
      en: ['Rice cooker', 'Fish board', 'Nori oven'],
    },
  },
  {
    id: 'olive',
    name: { vi: 'Bếp Vườn Ôliu', en: 'Olive Garden Kitchen' },
    color: '#ba7956',
    equipment: {
      vi: ['Nồi mì', 'Bàn làm sốt', 'Lò bánh'],
      en: ['Pasta pot', 'Sauce bench', 'Bread oven'],
    },
  },
  {
    id: 'lantern',
    name: { vi: 'Bếp Đèn Lồng', en: 'Lantern Wok' },
    color: '#bf6551',
    equipment: {
      vi: ['Chảo wok', 'Thớt rau', 'Bếp đậu'],
      en: ['Wok', 'Vegetable board', 'Tofu grill'],
    },
  },
  {
    id: 'orbit',
    name: { vi: 'Bếp Quỹ Đạo', en: 'Orbit Kitchen' },
    color: '#9a85cb',
    equipment: {
      vi: ['Bếp cảm ứng', 'Trạm trộn', 'Lò plasma'],
      en: ['Induction hob', 'Mixing bench', 'Plasma oven'],
    },
  },
];

// Hand-authored briefs: duration, orders, spawn interval, patience, layout variation.
const briefs = [
  ['Ca đầu tiên', 180, 2, 24, 105, 0],
  ['Nhánh song song', 180, 3, 28, 115, 1],
  ['Đón khách VIP', 180, 3, 27, 110, 2],
  ['Giờ ăn trưa', 210, 4, 26, 110, 0],
  ['Bánh giòn mới', 240, 4, 30, 125, 1],
  ['Khách vội', 240, 4, 29, 145, 2],
  ['Chuỗi phục vụ', 270, 5, 29, 130, 0],
  ['Hai luồng bếp', 270, 5, 28, 135, 1],
  ['Cuối tuần', 300, 6, 28, 135, 2],
  ['Tiệc Nắng Mai', 300, 6, 27, 140, 0],
  ['Cơm và cá', 240, 4, 30, 125, 0],
  ['Bàn thái cá', 240, 4, 29, 125, 1],
  ['Khách bên biển', 240, 4, 28, 130, 2],
  ['Sóng trưa', 270, 5, 28, 130, 0],
  ['Rong biển nướng', 270, 5, 30, 145, 1],
  ['Chuyến tàu sớm', 270, 5, 29, 150, 2],
  ['Nhịp thủy triều', 300, 6, 29, 145, 0],
  ['Quầy đôi', 300, 6, 28, 145, 1],
  ['Đêm hải đăng', 330, 7, 28, 150, 2],
  ['Tiệc biển', 330, 7, 27, 150, 0],
  ['Nước sôi', 240, 4, 30, 125, 0],
  ['Sốt vườn nhà', 240, 4, 29, 130, 1],
  ['Bàn khách quý', 270, 5, 29, 135, 2],
  ['Trưa ở vườn', 270, 5, 28, 135, 0],
  ['Bánh lò đá', 300, 6, 30, 145, 1],
  ['Đơn mang giờ hẹn', 300, 6, 29, 155, 2],
  ['Chuỗi Ôliu', 300, 6, 28, 150, 0],
  ['Bếp hai đảo', 330, 7, 29, 150, 1],
  ['Đêm mùa gặt', 330, 7, 28, 155, 2],
  ['Đại tiệc vườn', 360, 8, 28, 155, 0],
  ['Lửa nhỏ', 240, 4, 30, 130, 0],
  ['Rau sắc màu', 240, 4, 29, 130, 1],
  ['Đèn cho khách quý', 270, 5, 29, 140, 2],
  ['Chợ trưa', 270, 5, 28, 140, 0],
  ['Đậu nướng', 300, 6, 30, 150, 1],
  ['Chuyến xe cuối', 300, 6, 29, 160, 2],
  ['Nhịp chảo', 330, 7, 29, 155, 0],
  ['Phố hai quầy', 330, 7, 28, 155, 1],
  ['Hội đèn', 360, 8, 29, 160, 2],
  ['Tiệc đêm', 360, 8, 28, 160, 0],
  ['Bếp không gian', 240, 4, 30, 135, 0],
  ['Trộn rau sao', 270, 5, 30, 140, 1],
  ['Đại sứ', 270, 5, 29, 145, 2],
  ['Ca quỹ đạo', 300, 6, 29, 145, 0],
  ['Bánh plasma', 300, 6, 31, 155, 1],
  ['Tàu tốc hành', 330, 7, 30, 165, 2],
  ['Chuỗi thiên hà', 330, 7, 29, 160, 0],
  ['Hai trạm vệ tinh', 360, 8, 29, 160, 1],
  ['Mưa sao', 360, 8, 28, 165, 2],
  ['Tiệc năm nhà hàng', 360, 8, 27, 165, 0],
] as const;
const stationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'dispenser',
    'board',
    'stove',
    'counter',
    'assembly',
    'rack',
    'sink',
    'trash',
    'seat',
  ]),
  ingredient: z.string().optional(),
  x: z.number().int().min(1).max(13),
  z: z.number().int().min(1).max(9),
});
export const campaignLevelSchema = levelSchema.extend({
  restaurantId: z.string(),
  number: z.number().int().min(1).max(10),
  name,
  recipes: z.array(z.string()).min(1),
  recipeWeights: z.array(z.object({ recipeId: z.string(), weight: z.number().positive() })).min(1),
  customers: z.array(z.enum(['regular', 'vip', 'impatient', 'complex', 'combo'])).min(1),
  stations: z.array(stationSchema).min(10),
  tutorial: z.boolean(),
});
export type CampaignLevel = z.infer<typeof campaignLevelSchema>;
const authoredMenus = [
  [
    'sunshine-burger',
    'sunshine-cheeseburger',
    'sunshine-chicken-burger',
    'toasted-burger',
    'sunshine-fries',
  ],
  ['tide-dish', 'tide-signature-a', 'tide-signature-b', 'tide-premium', 'tide-signature-c'],
  ['olive-dish', 'olive-signature-a', 'olive-signature-b', 'olive-premium', 'olive-signature-c'],
  [
    'lantern-dish',
    'lantern-signature-a',
    'lantern-signature-b',
    'lantern-premium',
    'lantern-signature-c',
  ],
  ['orbit-dish', 'orbit-signature-a', 'orbit-signature-b', 'orbit-premium', 'orbit-signature-c'],
] as const;
const recipeWeights = [4, 3, 2, 2, 1] as const;
export const levels: CampaignLevel[] = briefs.map(
  ([title, duration, orders, spawn, patience, variation], index) => {
    const restaurant = Math.floor(index / 10),
      number = (index % 10) + 1,
      r = restaurants[restaurant];
    const unlockCount = number >= 10 ? 5 : number >= 5 ? 4 : number >= 3 ? 3 : number >= 2 ? 2 : 1;
    const menu = authoredMenus[restaurant].slice(0, unlockCount) as string[];
    const menuRecipes = menu.map((id) => recipes.find((recipe) => recipe.id === id)!);
    const basic = menuRecipes[0];
    const raw = [
      basic.steps[0].inputs[0],
      basic.steps[1].inputs[0],
      basic.components.find((c) => !basic.steps.some((s) => s.output === c))!,
    ];
    const layout: StationDefinition[] = stations.map((s) => ({ ...s }));
    [layout[0].ingredient, layout[2].ingredient, layout[4].ingredient] = raw;
    // Distinct work triangles per restaurant; variations move the pass/assembly islands.
    const arrangements = [
      [2, 4, 6, 8, 10],
      [10, 8, 6, 4, 2],
      [2, 6, 4, 10, 8],
      [8, 10, 2, 4, 6],
      [6, 2, 10, 8, 4],
    ];
    layout.slice(0, 5).forEach((s, i) => (s.x = arrangements[restaurant][i]));
    const assembly = layout.find((s) => s.id === 'assembly')!,
      counter = layout.find((s) => s.id === 'counter')!;
    assembly.x = [6, 5, 7][variation];
    assembly.z = restaurant % 2 ? 4 : 5;
    counter.x = [8, 9, 5][variation];
    counter.z = restaurant % 2 ? 6 : 5;
    const ingredientSources = new Set<string>(raw);
    for (const recipe of menuRecipes) {
      for (const input of recipe.steps
        .filter((step) => step.station !== 'assembly')
        .flatMap((step) => step.inputs))
        if (!recipe.steps.some((step) => step.output === input)) ingredientSources.add(input);
      for (const component of recipe.components)
        if (!recipe.steps.some((step) => step.output === component))
          ingredientSources.add(component);
    }
    const extraSources = [...ingredientSources].filter(
      (source) => !raw.includes(source) && source !== 'plate',
    );
    const sourceTiles = [
      // Keep unlocked specialty ingredients together in a front row so the
      // player can read and reach them without searching behind equipment.
      { x: 2, z: 7 },
      { x: 6, z: 7 },
      { x: 10, z: 7 },
    ];
    extraSources.forEach((source, sourceIndex) => {
      const tile = sourceTiles[sourceIndex];
      if (!tile) throw new Error(`Too many dispensers for ${r.id}-${number}`);
      layout.push({ id: `ingredient-${source}`, kind: 'dispenser', ingredient: source, ...tile });
    });
    if (number >= 5)
      layout.push(
        { id: 'oven', kind: 'stove', x: 11, z: 2 },
        { id: 'mixer', kind: 'board', x: 3, z: 4 },
      );
    const targetScore = index === 0 ? 220 : orders * 100;
    return campaignLevelSchema.parse({
      ...level,
      id: `${r.id}-${String(number).padStart(2, '0')}`,
      restaurantId: r.id,
      number,
      name: { vi: title, en: `${r.name.en} · Shift ${number}` },
      duration,
      targetOrders: orders,
      targetScore,
      spawnSeconds: spawn,
      patience,
      queuePatience: Math.max(65, patience * 0.8),
      plates: index === 0 ? 2 : 3,
      burnSeconds: 45,
      stations: layout,
      recipes: menu,
      recipeWeights: menu.map((recipeId, recipeIndex) => ({
        recipeId,
        weight: recipeWeights[recipeIndex],
      })),
      customers: [
        'regular',
        ...(number >= 3 ? ['vip'] : []),
        ...(number >= 5 ? ['complex'] : []),
        ...(number >= 6 ? ['impatient'] : []),
        ...(number >= 7 ? ['combo'] : []),
      ],
      tutorial: number <= 2,
      stars:
        index === 0
          ? level.stars
          : [targetScore, Math.ceil(targetScore * 1.35), Math.ceil(targetScore * 1.7)],
      maxAverageServiceThreeStars: index === 0 ? level.maxAverageServiceThreeStars : 65,
      minComboThreeStars: index === 0 ? level.minComboThreeStars : Math.min(orders, 4),
    });
  },
);
export function getLevel(id = level.id) {
  const value = levels.find((l) => l.id === id);
  if (!value) throw new Error('Unknown level');
  return value;
}
export function scaledLevel(id: string, size: number) {
  if (![1, 2, 3, 4].includes(size)) throw new Error('Invalid team size');
  const l = getLevel(id),
    extra = size - 1;
  return {
    ...l,
    // Larger crews have to move between more workstations and handle extra
    // tickets, so give them a proportionally longer shift.
    duration: l.duration + 60 * extra,
    targetScore: l.targetScore + 110 * extra,
    targetOrders: l.targetOrders + extra,
    plates: Math.min(4, l.plates + extra),
    spawnSeconds: Math.max(12, l.spawnSeconds - extra * 4),
    stars: l.stars.map((n) => n + 110 * extra) as [number, number, number],
  };
}
export function unlockedLevels(wins: readonly string[]) {
  let count = 1;
  while (count < levels.length && wins.includes(levels[count - 1].id)) count++;
  return levels.slice(0, count);
}
export function recordWin(wins: readonly string[], result: Result): string[] {
  const clean = levels.filter((l) => wins.includes(l.id)).map((l) => l.id);
  if (
    result.won &&
    result.levelId &&
    unlockedLevels(clean).some((l) => l.id === result.levelId) &&
    !clean.includes(result.levelId)
  )
    clean.push(result.levelId);
  return clean;
}
export function validateCampaign() {
  const restaurantSchema = z.object({
    id: z.string().min(1),
    name,
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    equipment: z.object({
      vi: z.array(z.string().min(1)).length(3),
      en: z.array(z.string().min(1)).length(3),
    }),
  });
  restaurants.forEach((r) => restaurantSchema.parse(r));
  if (restaurants.length !== 5 || new Set(restaurants.map((r) => r.id)).size !== 5)
    throw new Error('Expected five restaurants');
  if (levels.length !== 50 || new Set(levels.map((l) => l.id)).size !== 50)
    throw new Error('Expected 50 unique levels');
  if (recipes.length !== 25 || new Set(recipes.map((recipe) => recipe.id)).size !== 25)
    throw new Error('Expected five playable recipes per restaurant');
  for (const l of levels) {
    campaignLevelSchema.parse(l);
    if (
      !restaurants.some((r) => r.id === l.restaurantId) ||
      levels.filter((v) => v.restaurantId === l.restaurantId).length !== 10
    )
      throw new Error('Invalid restaurant levels');
    if (l.stars[0] !== l.targetScore || l.stars[1] < l.stars[0] || l.stars[2] < l.stars[1])
      throw new Error('Invalid star thresholds');
    if (
      l.recipeWeights.length !== l.recipes.length ||
      new Set(l.recipeWeights.map((entry) => entry.recipeId)).size !== l.recipes.length ||
      l.recipeWeights.some((entry) => !l.recipes.includes(entry.recipeId))
    )
      throw new Error(`Invalid recipe weights ${l.id}`);
    if (
      l.stations.some((s) => s.kind === 'dispenser' && (!s.ingredient || !items.has(s.ingredient)))
    )
      throw new Error('Unknown dispenser item');
    const transitions = new Map<string, string>();
    for (const r of l.recipes.map(recipeById))
      for (const s of r.steps.filter((s) => s.station !== 'assembly')) {
        const key = `${s.station}:${s.inputs.join(',')}`,
          output = JSON.stringify([s.output, s.seconds, s.taps]);
        if (transitions.has(key) && transitions.get(key) !== output)
          throw new Error('Ambiguous processor');
        transitions.set(key, output);
      }
    if (
      new Set(l.stations.map((s) => s.id)).size !== l.stations.length ||
      new Set(l.stations.map((s) => `${s.x},${s.z}`)).size !== l.stations.length
    )
      throw new Error(`Overlapping stations ${l.id}`);
    const available = new Set(l.stations.map((s) => s.ingredient).filter(Boolean));
    available.add('plate');
    for (const id of l.recipes) {
      const r = recipeById(id);
      validateRecipeGraph(r, l.stations, new Set(items.keys()));
      const pending = [...r.steps];
      const done = new Set<string>();
      const outputs = new Set(available);
      while (pending.length) {
        const i = pending.findIndex(
          (s) => s.dependsOn.every((d) => done.has(d)) && s.inputs.every((v) => outputs.has(v)),
        );
        if (i < 0) throw new Error(`Unproducible graph ${id}`);
        const [s] = pending.splice(i, 1);
        if (!l.stations.some((st) => st.id === s.station))
          throw new Error(`Missing equipment ${s.station}`);
        if (s.station !== 'assembly' && s.inputs.length !== 1)
          throw new Error('Processor needs one input');
        outputs.add(s.output);
        done.add(s.id);
      }
      if (!r.components.every((c) => outputs.has(c))) throw new Error('Unknown component');
    }
  }
}
validateCampaign();
