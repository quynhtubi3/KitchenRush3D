import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { floorPixels } from './floor-texture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { StationDefinition } from '../../../../packages/shared/src/types';
import { restaurantPopThemes } from './chaotic-pop-theme';
import { restaurantGraphics } from './restaurant-graphics';
import { visualGroundY } from './world-art';

const floorMaterials = new WeakMap<Scene, Map<string, PBRMaterial>>();
export function floorMaterial(scene: Scene, id: string) {
  let materials = floorMaterials.get(scene);
  if (!materials) floorMaterials.set(scene, (materials = new Map()));
  let material = materials.get(id);
  if (!material) {
    material = new PBRMaterial(`${id}-authored-floor`, scene);
    const texture = RawTexture.CreateRGBATexture(floorPixels(id, 512), 512, 512, scene);
    texture.anisotropicFilteringLevel = 4;
    material.albedoTexture = texture;
    material.roughness = id === 'tide' ? 0.68 : id === 'little-sun' ? 0.76 : 0.88;
    material.metallic = 0;
    materials.set(id, material);
  }
  return material;
}
export function sharedFloorMaterials(scene: Scene) {
  return [...(floorMaterials.get(scene)?.values() ?? [])];
}

/** Original procedural art. All dimensions are visual; simulation coordinates remain authoritative. */
export interface ArtTools {
  scene: Scene;
  box(
    name: string,
    w: number,
    h: number,
    d: number,
    radius: number,
    color: string,
    parent?: TransformNode,
    x?: number,
    y?: number,
    z?: number,
    roughness?: number,
    metallic?: number,
  ): Mesh;
  sphere(
    name: string,
    size: number,
    color: string,
    parent: TransformNode,
    x?: number,
    y?: number,
    z?: number,
  ): Mesh;
  cylinder(
    name: string,
    d: number,
    h: number,
    color: string,
    parent: TransformNode,
    x?: number,
    y?: number,
    z?: number,
    roughness?: number,
    metallic?: number,
  ): Mesh;
  tube(
    name: string,
    points: Vector3[],
    radius: number,
    color: string,
    parent: TransformNode,
    metallic?: number,
  ): Mesh;
  lathe(
    name: string,
    profile: Vector3[],
    color: string,
    parent: TransformNode,
    x?: number,
    y?: number,
    z?: number,
    roughness?: number,
    metallic?: number,
  ): Mesh;
  leaf(
    name: string,
    color: string,
    parent: TransformNode,
    x?: number,
    y?: number,
    z?: number,
    angle?: number,
    scale?: number,
  ): Mesh;
}
const themes = restaurantPopThemes;
export function restaurantArt(id: string) {
  return themes[id as keyof typeof themes] ?? themes['little-sun'];
}

export function buildRestaurant(a: ArtTools, id: string) {
  const t = restaurantArt(id);
  const room = new TransformNode(`${id}-architecture`, a.scene);
  a.box('floating diorama plinth', 15.4, 0.4, 11.4, 0.16, t.wood, room, 0, -0.3, 0);
  const ground = MeshBuilder.CreateGround(
    'walkable floor input',
    { width: 15, height: 11 },
    a.scene,
  );
  ground.parent = room;
  ground.position.y = visualGroundY;
  ground.receiveShadows = true;
  ground.isPickable = true;
  ground.material = floorMaterial(a.scene, id);
  a.box('rear wall', 15, 2.7, 0.2, 0.05, t.wall, room, 0, 1.25, -5.5);
  a.box('low side border', 0.16, 0.5, 11, 0.04, t.wood, room, -7.5, 0.2, 0);
  a.box('skirting', 15, 0.18, 0.24, 0.035, t.wood, room, 0, 0.09, -5.3);
  if (id === 'tide') {
    for (const x of [-5.3, -1.8, 1.8, 5.3]) {
      a.box('shoji timber surround', 2.7, 1.9, 0.18, 0.045, t.wood, room, x, 1.55, -5.29);
      a.box('shoji rice paper', 2.5, 1.7, 0.05, 0.02, '#fff1d4', room, x, 1.55, -5.17);
      for (let j = -2; j <= 2; j++)
        a.box(
          'shoji vertical lattice',
          0.035,
          1.7,
          0.05,
          0.008,
          t.wood,
          room,
          x + j * 0.43,
          1.55,
          -5.12,
        );
      for (let j = -1; j <= 1; j++)
        a.box(
          'shoji horizontal lattice',
          2.5,
          0.035,
          0.05,
          0.008,
          t.wood,
          room,
          x,
          1.55 + j * 0.42,
          -5.1,
        );
    }
    for (let i = 0; i < 7; i++) {
      const x = -6 + i * 2;
      const points = Array.from(
        { length: 17 },
        (_, j) => new Vector3(x - 0.8 + j * 0.1, 0.4 + Math.sin((j / 16) * Math.PI) * 0.32, -5.09),
      );
      a.tube('carved ocean wave', points, 0.035, '#5e909e', room);
    }
    for (const x of [-6.8, 6.8])
      for (let k = 0; k < 3; k++) {
        a.cylinder('bamboo stalk', 0.1, 2.4, t.cabinet, room, x + k * 0.13, 1.15, -4.7);
        for (let y = 0.4; y < 2.4; y += 0.42)
          a.cylinder('bamboo node', 0.13, 0.045, t.accent, room, x + k * 0.13, y, -4.7);
      }
    for (let i = 0; i < 5; i++)
      a.box(
        'indigo noren curtain',
        0.54,
        0.68,
        0.05,
        0.035,
        '#436b86',
        room,
        -1.2 + i * 0.6,
        2.7,
        -5.0,
      );
  } else if (id === 'olive') {
    for (const x of [-5, 0, 5]) {
      a.box('arched window shadow', 2.5, 1.2, 0.08, 0.14, '#6e998b', room, x, 1.55, -5.32);
      const arch = Array.from({ length: 21 }, (_, i) => {
        const angle = (i / 20) * Math.PI;
        return new Vector3(x + 1.35 * Math.cos(angle), 1.55 + 1.02 * Math.sin(angle), -5.15);
      });
      a.tube('warm plaster arch', arch, 0.15, '#f8e6bc', room);
      for (const side of [-1, 1])
        a.box('arch pillar', 0.3, 1.35, 0.25, 0.065, '#f8e6bc', room, x + side * 1.35, 0.94, -5.15);
      a.box('window sill', 2.9, 0.16, 0.52, 0.065, t.accent, room, x, 0.53, -5.1);
      for (let k = 0; k < 7; k++)
        a.box(
          'mosaic backsplash',
          0.26,
          0.23,
          0.06,
          0.015,
          k % 2 ? '#6a957e' : '#e8b75b',
          room,
          x - 0.9 + k * 0.3,
          0.33,
          -5.12,
        );
    }
    for (const x of [-6.8, 6.8]) {
      a.lathe(
        'olive oil amphora',
        [
          new Vector3(0, 0),
          new Vector3(0.24, 0.04),
          new Vector3(0.38, 0.52),
          new Vector3(0.2, 0.8),
          new Vector3(0.16, 0.96),
        ],
        '#ad6748',
        room,
        x,
        0,
        -4.7,
      );
      for (let i = 0; i < 9; i++) {
        const angle = i * 2.4;
        const leaf = a.sphere(
          'olive leaves',
          0.38,
          i % 2 ? '#7d985b' : '#4f7754',
          room,
          x + Math.cos(angle) * 0.35,
          1.05 + i * 0.1,
          -4.7 + Math.sin(angle) * 0.15,
        );
        leaf.scaling.set(1.4, 0.32, 0.7);
        a.tube(
          'olive branch',
          [new Vector3(x, 0.6, -4.7), leaf.position.clone()],
          0.024,
          t.wood,
          room,
        );
      }
    }
  } else if (id === 'lantern') {
    for (const x of [-7, -3.5, 0, 3.5, 7])
      a.box('timber post', 0.22, 3.1, 0.34, 0.055, t.wood, room, x, 1.45, -5.2);
    for (const y of [0.7, 2.5, 2.85])
      a.box('cross beam', 15.3, 0.18, 0.42, 0.055, t.wood, room, 0, y, -5.25);
    for (let i = 0; i < 5; i++) {
      const x = -6 + i * 3;
      a.tube(
        'lantern hanger',
        [new Vector3(x, 2.9, -5), new Vector3(x, 2.5, -5)],
        0.025,
        t.wood,
        room,
      );
      const lantern = a.sphere('ribbed red paper lantern', 0.82, '#d86744', room, x, 2.1, -4.95);
      lantern.scaling.y = 1.18;
      for (let k = -2; k <= 2; k++)
        a.cylinder(
          'lantern ribs',
          Math.sqrt(1 - (k * 0.28) ** 2) * 0.82,
          0.025,
          t.accent,
          room,
          x,
          2.1 + k * 0.15,
          -4.95,
        );
      a.cylinder('lantern cap', 0.3, 0.1, t.wood, room, x, 2.58, -4.95);
      a.tube(
        'golden tassel',
        [new Vector3(x, 1.64, -4.95), new Vector3(x, 1.35, -4.95)],
        0.035,
        t.accent,
        room,
      );
    }
    for (let i = 0; i < 16; i++)
      a.box(
        'roof ceramic tile',
        0.93,
        0.16,
        0.74,
        0.08,
        '#66564b',
        room,
        -7 + i * 0.94,
        3.05,
        -5.44,
      ).rotation.x = -0.22;
    for (const x of [-5.2, 5.2]) {
      a.box('street menu plaque', 0.68, 1.25, 0.12, 0.045, t.wood, room, x, 1.2, -5.07);
      for (let i = 0; i < 4; i++)
        a.box(
          'menu calligraphic mark',
          0.28,
          0.055,
          0.02,
          0.01,
          t.accent,
          room,
          x,
          1.6 - i * 0.23,
          -4.99,
        ).rotation.z = i % 2 ? 0.2 : -0.15;
    }
  } else if (id === 'orbit') {
    for (const x of [-5, 0, 5]) {
      const frame = a.cylinder(
        'porthole titanium ring',
        2.3,
        0.19,
        t.wood,
        room,
        x,
        1.4,
        -5.22,
        0.35,
        0.5,
      );
      frame.rotation.x = Math.PI / 2;
      const glass = a.cylinder(
        'deep space glass',
        1.97,
        0.06,
        '#233750',
        room,
        x,
        1.4,
        -5.08,
        0.2,
        0.1,
      );
      glass.rotation.x = Math.PI / 2;
      for (let i = 0; i < 11; i++)
        a.sphere(
          'distant star',
          0.025 + (i % 3) * 0.012,
          '#c5e8e1',
          room,
          x + Math.sin(i * 5) * 0.7,
          1.4 + Math.cos(i * 3) * 0.7,
          -5.02,
        );
      const planet = a.sphere('candy planet', 0.47, '#bc8fb8', room, x + 0.2, 1.5, -4.97);
      planet.scaling.z = 0.2;
    }
    for (const x of [-7.1, -2.5, 2.5, 7.1]) {
      a.box('structural rib', 0.27, 3, 0.38, 0.1, t.wood, room, x, 1.35, -5.02);
      a.box('cyan light insert', 0.07, 2.3, 0.06, 0.025, t.accent, room, x, 1.5, -4.81);
    }
    for (const z of [-4.6, 4.7])
      a.box('deck guidance light', 13, 0.025, 0.055, 0.02, t.accent, room, 0, 0.015, z);
    for (const x of [-6.6, 6.6]) {
      a.cylinder('hydroponic pedestal', 0.6, 0.52, t.wood, room, x, 0.26, -4.3, 0.4, 0.4);
      for (let i = 0; i < 4; i++)
        a.sphere(
          'alien succulent',
          0.3,
          i % 2 ? '#76bdaf' : '#bfa2ce',
          room,
          x + Math.sin(i * 2) * 0.18,
          0.66 + i * 0.14,
          -4.3 + Math.cos(i * 2) * 0.12,
        ).scaling.set(0.7, 1.5, 0.7);
    }
  }
  restaurantGraphics(a, room, id);
  // Architecture must not intercept floor touches or station selection.
  room.getChildMeshes().forEach((m) => (m.isPickable = m.name === 'walkable floor input'));
  // Dedicated ground carries input without changing collision/pathfinding.
  return room;
}

export function dressStation(
  a: ArtTools,
  station: TransformNode,
  def: StationDefinition,
  id: string,
) {
  const t = restaurantArt(id);
  if (def.id === 'oven') {
    a.box('oven insulated hood', 0.94, 0.28, 0.24, 0.1, t.cabinet, station, 0, 1.02, -0.31);
    a.box('oven glass window', 0.64, 0.2, 0.04, 0.035, '#334542', station, 0, 0.48, 0.49, 0.2, 0.2);
    a.box(
      'oven horizontal handle',
      0.56,
      0.045,
      0.08,
      0.02,
      t.accent,
      station,
      0,
      0.65,
      0.54,
      0.3,
      0.5,
    );
  }
  // One large readable detail per appliance; merged with its existing material group.
  if (def.kind === 'stove') {
    const dial = a.cylinder(
      'oversized enamel heat dial',
      0.23,
      0.09,
      t.accent,
      station,
      0.18,
      0.69,
      0.57,
    );
    dial.rotation.x = Math.PI / 2;
    a.box('heat dial pointer', 0.035, 0.085, 0.025, 0.008, t.wood, station, 0.18, 0.73, 0.63);
  } else if (def.kind === 'board' && def.id !== 'mixer') {
    a.box('thick chopping board grip', 0.2, 0.08, 0.24, 0.045, t.wood, station, 0.35, 1.0, 0.04);
  } else if (def.kind === 'sink') {
    for (const x of [-0.25, 0.25])
      a.sphere('chunky faucet tap', 0.16, t.accent, station, x, 1.09, -0.24);
  } else if (def.kind === 'assembly' || def.kind === 'counter') {
    a.box('chunky counter pull', 0.38, 0.07, 0.11, 0.025, t.accent, station, 0, 0.66, 0.49);
  } else if (def.kind === 'dispenser') {
    a.box('dispenser front lip', 0.62, 0.13, 0.08, 0.035, t.accent, station, 0, 1.01, 0.42);
  }
  if (def.id === 'mixer') {
    a.lathe(
      'steel mixing bowl',
      [
        new Vector3(0.1, 0),
        new Vector3(0.25, 0.07),
        new Vector3(0.36, 0.28),
        new Vector3(0.32, 0.28),
        new Vector3(0.2, 0.08),
      ],
      '#a4bebc',
      station,
      0,
      0.94,
      0,
      0.28,
      0.4,
    );
    a.tube(
      'whisk',
      [new Vector3(0.0, 1.01, 0), new Vector3(0.22, 1.38, -0.12)],
      0.035,
      t.wood,
      station,
    );
  }
  if (def.kind === 'seat') {
    // Customer anchor is one cell to the right of the table, as in the simulation.
    for (const m of station.getChildMeshes())
      if (m.name.startsWith('diner booth') || m.name.startsWith('booth ')) m.dispose();
    a.box('upholstered seat', 0.72, 0.16, 0.76, 0.1, t.cabinet, station, 1, 0.43, 0);
    a.box('upholstered backrest', 0.16, 0.85, 0.8, 0.08, t.cabinet, station, 1.38, 0.85, 0);
    for (const z of [-0.25, 0.25]) a.cylinder('chair leg', 0.06, 0.4, t.wood, station, 1, 0.2, z);
  }
  if (id === 'little-sun') return;
  if (def.kind === 'assembly' && id === 'tide')
    for (let i = 0; i < 12; i++)
      a.cylinder(
        'bamboo sushi rolling mat',
        0.045,
        0.68,
        t.accent,
        station,
        -0.33 + i * 0.06,
        0.99,
        0,
      ).rotation.x = Math.PI / 2;
  if (def.kind === 'stove' && def.id !== 'oven') {
    for (const m of station.getChildMeshes())
      if (/skillet|pan |grill ridge|grill crossbar/.test(m.name)) m.dispose();
    if (id === 'lantern') {
      a.lathe(
        'seasoned curved wok',
        [
          new Vector3(0.06, 0),
          new Vector3(0.18, 0.04),
          new Vector3(0.31, 0.12),
          new Vector3(0.43, 0.28),
          new Vector3(0.4, 0.29),
          new Vector3(0.27, 0.13),
          new Vector3(0.08, 0.05),
        ],
        '#384741',
        station,
        0,
        0.95,
        0,
        0.6,
        0.2,
      );
      for (const x of [-0.48, 0.48])
        a.tube(
          'wok loop handle',
          [
            new Vector3(x * 0.8, 1.17, -0.13),
            new Vector3(x, 1.2, 0),
            new Vector3(x * 0.8, 1.17, 0.13),
          ],
          0.035,
          t.wood,
          station,
        );
    } else if (id === 'tide' || id === 'olive') {
      a.lathe(
        id === 'tide' ? 'ceramic rice cooker' : 'copper pasta pot',
        [
          new Vector3(0.22, 0),
          new Vector3(0.29, 0.05),
          new Vector3(0.3, 0.32),
          new Vector3(0.27, 0.34),
          new Vector3(0.25, 0.08),
        ],
        id === 'tide' ? '#ecdfc0' : '#af7951',
        station,
        0,
        0.94,
        0,
        0.5,
        0.18,
      );
      for (const x of [-0.38, 0.38])
        a.box('pot handle', 0.17, 0.08, 0.19, 0.035, t.wood, station, x, 1.17, 0);
    } else {
      a.cylinder('induction halo', 0.78, 0.03, t.accent, station, 0, 1.02, 0, 0.24, 0.25);
      a.cylinder('induction ceramic', 0.62, 0.035, t.wood, station, 0, 1.04, 0, 0.3, 0.1);
    }
  }
  if (id === 'orbit' && def.kind !== 'seat')
    a.box('illuminated control strip', 0.6, 0.035, 0.025, 0.01, t.accent, station, 0, 0.68, 0.54);
  if (id === 'olive' && def.kind === 'counter') {
    a.lathe(
      'oil cruet',
      [
        new Vector3(0.09, 0),
        new Vector3(0.11, 0.2),
        new Vector3(0.035, 0.29),
        new Vector3(0.035, 0.39),
      ],
      '#6d8443',
      station,
      -0.36,
      0.95,
      -0.25,
      0.3,
    );
  }
}

export function cuisineFood(a: ArtTools, p: TransformNode, kind: string): boolean {
  const [id, stage] = kind.split('-');
  if (!['tide', 'olive', 'lantern', 'orbit'].includes(id)) return false;
  if (!['raw', 'hot', 'green', 'cut', 'side', 'crisp', 'premium'].includes(stage)) return false;
  if (kind.split('-').length > 2 && stage === 'side' && !kind.endsWith('-prepared')) return false;
  const cooked = stage === 'hot' || stage === 'cut' || stage === 'crisp';
  if (kind.endsWith('-prepared'))
    for (let i = 0; i < 3; i++)
      a.sphere('seasoned prepared side', 0.04, '#cbbb83', p, (i - 1) * 0.1, 0.22, 0.04).scaling.y =
        0.35;
  if (id === 'tide') {
    if (stage === 'raw' || stage === 'hot') {
      a.sphere('rice mound', 0.38, cooked ? '#fff3db' : '#dacead', p, 0, 0.08, 0).scaling.set(
        1,
        0.45,
        0.85,
      );
      for (let i = 0; i < 7; i++)
        a.sphere(
          'individual rice grain',
          0.07,
          '#fff7e7',
          p,
          Math.sin(i * 2.4) * 0.14,
          0.14 + (i % 3) * 0.02,
          Math.cos(i * 2.4) * 0.12,
        ).scaling.set(0.6, 0.6, 1.7);
    } else if (stage === 'green' || stage === 'cut') {
      const n = stage === 'cut' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.14;
        a.box('salmon fillet', n === 1 ? 0.4 : 0.12, 0.12, 0.28, 0.035, '#ed906e', p, x, 0.1, 0);
        for (let j = 0; j < 3; j++)
          a.tube(
            'salmon fat chevron',
            [
              new Vector3(x - 0.04, 0.163, -0.12 + j * 0.09),
              new Vector3(x + 0.03, 0.163, -0.08 + j * 0.09),
            ],
            0.009,
            '#ffddae',
            p,
          );
      }
    } else {
      a.box('nori sheet', 0.45, 0.026, 0.39, 0.012, cooked ? '#3f5641' : '#304b3e', p, 0, 0.07, 0);
      for (let i = 0; i < 5; i++)
        a.tube(
          'nori grain',
          [new Vector3(-0.19, 0.087, -0.15 + i * 0.07), new Vector3(0.19, 0.087, -0.15 + i * 0.07)],
          0.006,
          '#648052',
          p,
        );
    }
  } else if (id === 'olive') {
    if (stage === 'raw' || stage === 'hot') {
      for (let i = 0; i < 6; i++) {
        const points = Array.from(
          { length: 9 },
          (_, j) =>
            new Vector3(
              Math.cos(j * 0.38 + i) * (0.09 + i * 0.013),
              0.06 + i * 0.009,
              Math.sin(j * 0.38 + i) * (0.09 + i * 0.013),
            ),
        );
        a.tube(
          cooked ? 'curled al dente pasta' : 'dry pasta nest',
          points,
          0.016,
          cooked ? '#f1cc76' : '#dab160',
          p,
        );
      }
    } else if (stage === 'green') {
      a.sphere('ripe tomato', 0.34, '#d66548', p, 0, 0.13, 0);
      for (let i = 0; i < 5; i++)
        a.tube(
          'tomato calyx',
          [
            new Vector3(0, 0.3, 0),
            new Vector3(Math.cos(i * 1.26) * 0.11, 0.28, Math.sin(i * 1.26) * 0.11),
          ],
          0.018,
          '#678044',
          p,
        );
    } else if (stage === 'cut') {
      a.cylinder('thick tomato sauce', 0.4, 0.065, '#bd5136', p, 0, 0.08, 0);
      for (let i = 0; i < 5; i++)
        a.sphere(
          'sauce tomato chunks',
          0.08,
          '#e27b42',
          p,
          Math.sin(i * 2) * 0.12,
          0.12,
          Math.cos(i * 2) * 0.12,
        );
    } else {
      a.sphere('flatbread', 0.46, cooked ? '#b98246' : '#e6bd7c', p, 0, 0.08, 0).scaling.set(
        1,
        0.22,
        0.8,
      );
      for (let i = 0; i < 6; i++)
        a.sphere(
          'toasted bread blister',
          0.045,
          '#976536',
          p,
          Math.sin(i * 2) * 0.14,
          0.125,
          Math.cos(i * 2) * 0.11,
        ).scaling.y = 0.3;
    }
  } else if (id === 'lantern') {
    if (stage === 'raw' || stage === 'hot') {
      for (let i = 0; i < 6; i++)
        a.tube(
          'folded noodle strand',
          Array.from(
            { length: 9 },
            (_, j) => new Vector3(-0.2 + j * 0.05, 0.08 + i * 0.012, Math.sin(j * 0.8 + i) * 0.12),
          ),
          0.014,
          cooked ? '#b98143' : '#f3e6bb',
          p,
        );
    } else if (stage === 'green') {
      for (let i = 0; i < 3; i++)
        a.sphere(
          'bell pepper lobe',
          0.22,
          '#d97845',
          p,
          Math.sin(i * 2.1) * 0.07,
          0.14,
          Math.cos(i * 2.1) * 0.07,
        ).scaling.y = 1.4;
      a.tube(
        'pepper stalk',
        [new Vector3(0, 0.25, 0), new Vector3(0.04, 0.37, 0)],
        0.027,
        '#6b8c46',
        p,
      );
    } else if (stage === 'cut') {
      for (let i = 0; i < 6; i++)
        a.box(
          'diced pepper',
          0.11,
          0.075,
          0.1,
          0.025,
          i % 2 ? '#d77e46' : '#7e9c4d',
          p,
          Math.sin(i * 2.4) * 0.16,
          0.07,
          Math.cos(i * 2.4) * 0.14,
        );
    } else {
      for (let i = 0; i < 3; i++) {
        a.box(
          'tofu cube',
          0.17,
          0.15,
          0.18,
          0.025,
          cooked ? '#dca45d' : '#f1e9cb',
          p,
          (i - 1) * 0.15,
          0.1,
          (i % 2) * 0.09,
        );
        if (cooked)
          for (let j = 0; j < 2; j++)
            a.box(
              'tofu grill mark',
              0.12,
              0.008,
              0.015,
              0.004,
              '#8c5c3e',
              p,
              (i - 1) * 0.15,
              0.18,
              (i % 2) * 0.09 - 0.04 + j * 0.07,
            );
      }
    }
  } else {
    if (stage === 'raw' || stage === 'hot') {
      a.cylinder(
        'plant protein medallion',
        0.4,
        0.12,
        cooked ? '#a87768' : '#c7ac94',
        p,
        0,
        0.09,
        0,
      );
      for (let i = 0; i < 3; i++)
        a.box(
          'protein scoring',
          0.27,
          0.012,
          0.018,
          0.005,
          cooked ? '#6f5154' : '#ead4b2',
          p,
          0,
          0.16,
          -0.08 + i * 0.08,
        );
    } else if (stage === 'green' || stage === 'cut') {
      for (let i = 0; i < 5; i++)
        a.leaf(
          'orbit hydroponic greens',
          i % 2 ? '#77b2a1' : '#91c6a0',
          p,
          Math.sin(i * 1.256) * 0.11,
          0.1,
          Math.cos(i * 1.256) * 0.11,
          i * 1.256,
          0.8,
        );
    } else {
      a.sphere('orb bread', 0.36, cooked ? '#c59bd0' : '#dabbb0', p, 0, 0.15, 0);
      a.tube(
        'spiral plasma crust',
        Array.from(
          { length: 25 },
          (_, i) =>
            new Vector3(
              Math.cos(i * 0.3) * 0.174,
              0.15 + Math.sin(i * 0.3) * 0.1,
              Math.sin(i * 0.3) * 0.15,
            ),
        ),
        0.014,
        cooked ? '#98dfce' : '#f2dcc3',
        p,
      );
    }
  }
  return true;
}
