import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

type Cell = { x: number; z: number };
type StationCell = { x: number; z: number };
type CatMood = 'lying' | 'sitting' | 'walking';

function furTexture(scene: Scene) {
  const texture = new DynamicTexture(
    'restaurant-cat-calico-fur',
    { width: 512, height: 256 },
    scene,
  );
  texture.hasAlpha = false;
  texture.wrapU = 1;
  texture.wrapV = 1;
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  context.fillStyle = '#f8f4ec';
  context.fillRect(0, 0, 512, 256);

  const patch = (x: number, y: number, rx: number, ry: number, color: string, angle = 0) => {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };
  // Soft, irregular tortoiseshell patches around a white chest and belly.
  patch(70, 85, 92, 58, '#bf793f', -0.2);
  patch(115, 55, 38, 26, '#986044', 0.45);
  patch(200, 210, 57, 34, '#b96d3e', 0.25);
  patch(307, 52, 68, 42, '#777267', -0.28);
  patch(377, 83, 35, 23, '#978c77', 0.35);
  patch(450, 206, 81, 39, '#9e653f', -0.3);
  patch(285, 232, 34, 16, '#817a6e', 0.1);
  for (const [x, y] of [
    [38, 177],
    [149, 121],
    [243, 29],
    [343, 152],
    [409, 55],
    [486, 112],
  ]) {
    patch(x, y, 13, 8, '#8b8171', 0.3);
  }
  texture.update(false);
  return texture;
}

function material(scene: Scene, name: string, hex: string, roughness = 0.86, metallic = 0) {
  const result = new PBRMaterial(name, scene);
  result.albedoColor = Color3.FromHexString(hex);
  result.roughness = roughness;
  result.metallic = metallic;
  result.environmentIntensity = 0.35;
  return result;
}

function sphere(
  scene: Scene,
  name: string,
  parent: TransformNode,
  surface: PBRMaterial,
  position: Vector3,
  scaling: Vector3,
  segments = 8,
) {
  const mesh = MeshBuilder.CreateSphere(name, { diameter: 1, segments }, scene);
  mesh.parent = parent;
  mesh.position.copyFrom(position);
  mesh.scaling.copyFrom(scaling);
  mesh.material = surface;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  return mesh;
}

function safeCells(stations: StationCell[]): Cell[] {
  const result: Cell[] = [];
  for (let z = 1; z <= 9; z++)
    for (let x = 1; x <= 13; x++) {
      const tooClose = stations.some((station) => Math.hypot(x - station.x, z - station.z) < 0.78);
      if (!tooClose) result.push({ x, z });
    }
  return result.length ? result : [{ x: 7, z: 8 }];
}

function spreadCells(cells: Cell[], count: number, stations: StationCell[]) {
  const remaining = [...cells];
  const result: Cell[] = [];
  while (remaining.length && result.length < count) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index];
      const distance = result.length
        ? Math.min(
            ...result.map((point) => Math.hypot(point.x - candidate.x, point.z - candidate.z)),
          )
        : Math.hypot(candidate.x - 7, candidate.z - 5);
      const clearance = stations.length
        ? Math.min(
            ...stations.map((station) =>
              Math.hypot(candidate.x - station.x, candidate.z - station.z),
            ),
          )
        : 3;
      const score = distance + Math.min(clearance, 3) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    result.push(remaining.splice(bestIndex, 1)[0]);
  }
  return result;
}

function route(from: Cell, to: Cell, blocked: Set<string>): Cell[] {
  const key = (cell: Cell) => `${cell.x},${cell.z}`;
  const start = key(from);
  const goal = key(to);
  const queue = [from];
  const previous = new Map<string, string | null>([[start, null]]);
  const byKey = new Map([[start, from]]);
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index];
    if (key(cell) === goal) break;
    for (const next of [
      { x: cell.x + 1, z: cell.z },
      { x: cell.x - 1, z: cell.z },
      { x: cell.x, z: cell.z + 1 },
      { x: cell.x, z: cell.z - 1 },
    ]) {
      const nextKey = key(next);
      if (next.x < 1 || next.x > 13 || next.z < 1 || next.z > 9 || blocked.has(nextKey)) continue;
      if (previous.has(nextKey)) continue;
      previous.set(nextKey, key(cell));
      byKey.set(nextKey, next);
      queue.push(next);
    }
  }
  if (!previous.has(goal)) return [];
  const path: Cell[] = [];
  let current: string | null = goal;
  while (current && current !== start) {
    path.push(byKey.get(current)!);
    current = previous.get(current) ?? null;
  }
  return path.reverse();
}

/** Small local-only restaurant companion. It never participates in simulation or collision. */
export class RestaurantCat {
  readonly root: TransformNode;
  private readonly body: TransformNode;
  private readonly head: TransformNode;
  private readonly tail: TransformNode;
  private readonly legs: TransformNode[] = [];
  private readonly fur: PBRMaterial;
  private readonly cream: PBRMaterial;
  private readonly orange: PBRMaterial;
  private readonly gray: PBRMaterial;
  private readonly darkFur: PBRMaterial;
  private readonly pink: PBRMaterial;
  private readonly eyes: TransformNode[] = [];
  private contact!: Mesh;
  private nextBlink = 3.8;
  private blinkTimer = 0;
  private readonly amber: PBRMaterial;
  private readonly pupil: PBRMaterial;
  private readonly glint: PBRMaterial;
  private readonly gold: PBRMaterial;
  private readonly charmGreen: PBRMaterial;
  private safe: Cell[] = [];
  private destinations: Cell[] = [];
  private currentCell: Cell = { x: 7, z: 8 };
  private walkingPath: Cell[] = [];
  private mood: CatMood = 'lying';
  private moodTimer = 4.5;
  private timeToMeow = 31;
  private posture = 1;
  private petTimer = 0;
  private time = 0;
  private lying = false;
  private readonly bodyPosition = new Vector3();
  private readonly headPosition = new Vector3();
  onMeow: () => void = () => {};

  constructor(
    private readonly scene: Scene,
    stations: StationCell[],
  ) {
    this.root = new TransformNode('calico-cafe-cat', scene);
    this.root.position.set(0, 0, 0);
    this.root.metadata = { decorative: true, companion: 'calico-cat' };
    this.body = new TransformNode('calico-cat-body-pose', scene);
    this.body.parent = this.root;
    this.head = new TransformNode('calico-cat-head-pose', scene);
    this.head.parent = this.root;
    this.tail = new TransformNode('calico-cat-tail-wag', scene);
    this.tail.parent = this.root;

    this.fur = material(scene, 'cat calico coat', '#ffffff', 0.96);
    this.fur.albedoTexture = furTexture(scene);
    this.cream = material(scene, 'cat warm white fur', '#f7f2e8', 0.96);
    this.orange = material(scene, 'cat marmalade patches', '#d18a47', 0.94);
    this.gray = material(scene, 'cat silver tabby patches', '#77736d', 0.95);
    this.darkFur = material(scene, 'cat tabby markings', '#514e49', 0.92);
    this.pink = material(scene, 'cat nose and ears', '#d78382', 0.55);
    this.amber = material(scene, 'cat amber eyes', '#dca94c', 0.24);
    this.pupil = material(scene, 'cat pupils', '#171817', 0.2);
    this.glint = material(scene, 'cat eye glints', '#ffffff', 0.16);
    this.gold = material(scene, 'cat polished gold collar', '#d4a647', 0.31, 0.62);
    this.charmGreen = material(scene, 'cat charm enamel', '#244d46', 0.32, 0.12);
    this.buildBody();
    this.buildHead();
    this.buildTail();
    this.buildContact();
    this.setStations(stations);
    this.applyPose(0);
  }

  private buildBody() {
    sphere(
      this.scene,
      'plush calico body',
      this.body,
      this.fur,
      new Vector3(0, 0, 0),
      new Vector3(0.72, 0.65, 1.03),
      12,
    );
    sphere(
      this.scene,
      'soft white bib',
      this.body,
      this.cream,
      new Vector3(0, -0.01, 0.3),
      new Vector3(0.5, 0.53, 0.45),
      10,
    );

    for (const [index, x, z, front] of [
      [0, -0.22, 0.37, true],
      [1, 0.22, 0.37, true],
      [2, -0.24, -0.45, false],
      [3, 0.24, -0.45, false],
    ] as const) {
      const leg = new TransformNode(`cat leg pose ${index}`, this.scene);
      leg.parent = this.root;
      leg.position.set(x, 0.25, z);
      this.legs.push(leg);
      sphere(
        this.scene,
        `white cat leg ${index}`,
        leg,
        this.cream,
        new Vector3(0, -0.02, 0),
        new Vector3(front ? 0.23 : 0.26, front ? 0.4 : 0.35, 0.26),
      );
      sphere(
        this.scene,
        `soft cat paw ${index}`,
        leg,
        this.cream,
        new Vector3(0, -0.16, 0.065),
        new Vector3(0.29, 0.18, 0.33),
      );
      this.mergeChildren(leg);
    }

    const collar = MeshBuilder.CreateTorus(
      'tiny golden cat collar',
      { diameter: 0.48, thickness: 0.045, tessellation: 24 },
      this.scene,
    );
    collar.parent = this.head;
    collar.rotation.x = 0;
    collar.position.set(0, -0.29, -0.08);
    collar.scaling.set(1, 0.82, 1);
    collar.material = this.gold;
    collar.isPickable = false;

    const tag = sphere(
      this.scene,
      'gold cat pendant',
      this.head,
      this.gold,
      new Vector3(0, -0.37, 0.22),
      new Vector3(0.14, 0.18, 0.045),
      12,
    );
    tag.rotation.z = Math.PI / 8;
    sphere(
      this.scene,
      'green enamel in cat pendant',
      this.head,
      this.charmGreen,
      new Vector3(0, -0.37, 0.25),
      new Vector3(0.075, 0.09, 0.022),
      10,
    );
    void tag;
    this.mergeChildren(this.root);
    this.mergeChildren(this.body);
  }

  private buildHead() {
    // Broad cheeks and a white blaze: markings are part of the skin, not floating blobs.
    const face = sphere(
      this.scene,
      'Keo calico face',
      this.head,
      this.cream,
      Vector3.Zero(),
      new Vector3(0.91, 0.76, 0.76),
      16,
    );
    const positions = face.getVerticesData('position')!;
    const colors: number[] = [];
    const white = Color3.White();
    const ginger = Color3.FromHexString('#cf894d');
    const tabby = Color3.FromHexString('#77746d');
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i],
        y = positions[i + 1],
        z = positions[i + 2];
      const blaze = 0.035 + Math.max(0, 0.26 - y) * 0.48;
      const edge = Math.min(Math.abs(x) - blaze, y - 0.14 + Math.sin(x * 15 + z * 9) * 0.025);
      const mix = Math.max(0, Math.min(1, edge * 28));
      const color = Color3.Lerp(white, x < 0 ? ginger : tabby, mix);
      // Subtle tabby bands restricted to the grey cap.
      const stripe = x > blaze && y > 0.2 && Math.sin((x + z * 0.24) * 62) > 0.65 ? 0.82 : 1;
      colors.push(color.r * stripe, color.g * stripe, color.b * stripe, 1);
    }
    face.setVerticesData('color', colors);

    for (const side of [-1, 1]) {
      // Flattened, softly tapered ear shells, rather than cones.
      this.ear(side, false);
      this.ear(side, true);
      const eye = new TransformNode('Keo eye ' + side, this.scene);
      eye.parent = this.head;
      eye.position.set(side * 0.205, 0.005, 0.33);
      eye.rotation.y = side * 0.17;
      this.eyes.push(eye);
      sphere(
        this.scene,
        'soft eye rim',
        eye,
        this.darkFur,
        Vector3.Zero(),
        new Vector3(0.27, 0.28, 0.055),
        10,
      );
      sphere(
        this.scene,
        'honey iris',
        eye,
        this.amber,
        new Vector3(0, 0, 0.025),
        new Vector3(0.23, 0.245, 0.035),
        10,
      );
      sphere(
        this.scene,
        'round kitten pupil',
        eye,
        this.pupil,
        new Vector3(-side * 0.013, 0.003, 0.043),
        new Vector3(0.115, 0.175, 0.027),
        10,
      );
      sphere(
        this.scene,
        'eye reflection',
        eye,
        this.glint,
        new Vector3(-0.037, 0.06, 0.06),
        new Vector3(0.045, 0.055, 0.016),
        6,
      );
      sphere(
        this.scene,
        'eye sparkle',
        eye,
        this.glint,
        new Vector3(0.043, -0.045, 0.057),
        new Vector3(0.019, 0.021, 0.013),
        6,
      );
      this.mergeChildren(eye);
      sphere(
        this.scene,
        'velvet muzzle',
        this.head,
        this.cream,
        new Vector3(side * 0.085, -0.16, 0.32),
        new Vector3(0.245, 0.165, 0.145),
        10,
      );
    }
    const nose = sphere(
      this.scene,
      'rose button nose',
      this.head,
      this.pink,
      new Vector3(0, -0.11, 0.395),
      new Vector3(0.12, 0.08, 0.062),
      8,
    );
    const points = nose.getVerticesData('position')!;
    for (let i = 0; i < points.length; i += 3) points[i] *= 0.72 + points[i + 1] * 0.65;
    nose.setVerticesData('position', points);
    const lines = [
      [
        new Vector3(0, -0.146, 0.41),
        new Vector3(0, -0.196, 0.403),
        new Vector3(-0.032, -0.218, 0.397),
        new Vector3(-0.075, -0.201, 0.395),
      ],
      [
        new Vector3(0, -0.196, 0.403),
        new Vector3(0.032, -0.218, 0.397),
        new Vector3(0.075, -0.201, 0.395),
      ],
    ];
    for (const side of [-1, 1])
      for (let line = 0; line < 2; line++) {
        lines.push([
          new Vector3(side * 0.16, -0.16 - line * 0.035, 0.382),
          new Vector3(side * 0.36, -0.15 - line * 0.05, 0.33),
          new Vector3(side * 0.48, -0.12 - line * 0.08, 0.25),
        ]);
      }
    const whiskers = MeshBuilder.CreateLineSystem('Keo smile and whiskers', { lines }, this.scene);
    whiskers.parent = this.head;
    whiskers.color = Color3.FromHexString('#78695d');
    whiskers.isPickable = false;
    this.mergeChildren(this.head);
  }

  private ear(side: number, inner: boolean) {
    const mesh = sphere(
      this.scene,
      inner ? 'pink velvet ear' : 'soft triangular ear',
      this.head,
      inner ? this.pink : side < 0 ? this.orange : this.gray,
      new Vector3(side * 0.29, inner ? 0.38 : 0.37, inner ? 0.105 : 0),
      inner ? new Vector3(0.235, 0.32, 0.043) : new Vector3(0.38, 0.46, 0.17),
      10,
    );
    const positions = mesh.getVerticesData('position')!;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] *= 0.85 - positions[i + 1] * 1.2;
      positions[i] += side * positions[i + 1] * 0.24;
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, mesh.getIndices()!, normals);
    mesh.setVerticesData('position', positions);
    mesh.setVerticesData('normal', normals);
  }

  private buildContact() {
    const texture = new DynamicTexture('Keo soft contact', { width: 64, height: 64 }, this.scene);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const gradient = ctx.createRadialGradient(32, 32, 5, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(54,40,32,0.23)');
    gradient.addColorStop(0.6, 'rgba(54,40,32,0.12)');
    gradient.addColorStop(1, 'rgba(54,40,32,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    texture.hasAlpha = true;
    texture.update(false);
    const shadow = material(this.scene, 'Keo contact', '#ffffff');
    shadow.unlit = true;
    shadow.albedoTexture = texture;
    shadow.useAlphaFromAlbedoTexture = true;
    shadow.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    this.contact = MeshBuilder.CreateGround(
      'Keo grounded shadow',
      { width: 1.24, height: 1.72 },
      this.scene,
    );
    this.contact.parent = this.root;
    this.contact.material = shadow;
    this.contact.isPickable = false;
  }

  private buildTail() {
    // One continuous tapered curve avoids hard seams between separate tail sections.
    const points: Vector3[] = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22,
        u = 1 - t;
      points.push(
        new Vector3(
          3 * u * u * t * -0.38 + 3 * u * t * t * -0.3 + t * t * t * 0.14,
          3 * u * u * t * 0.13 + 3 * u * t * t * 0.6 + t * t * t * 0.38,
          3 * u * u * t * -0.35 + 3 * u * t * t * -0.7 + t * t * t * -0.87,
        ),
      );
    }
    const tube = MeshBuilder.CreateTube(
      'Keo curved tabby tail',
      {
        path: points,
        tessellation: 8,
        cap: Mesh.CAP_ALL,
        radiusFunction: (index) => 0.092 - (0.043 * index) / 22,
      },
      this.scene,
    );
    tube.parent = this.tail;
    tube.material = this.cream;
    tube.isPickable = false;
    const positions = tube.getVerticesData('position')!;
    const colors: number[] = [];
    const ginger = Color3.FromHexString('#cc894d');
    const gray = Color3.FromHexString('#827d72');
    const charcoal = Color3.FromHexString('#56524b');
    for (let i = 0; i < positions.length; i += 3) {
      const t = Math.min(1, Math.max(0, -positions[i + 2] / 0.87));
      const base = Color3.Lerp(ginger, gray, Math.min(1, t * 2));
      const band = t > 0.82 ? 1 : Math.max(0, Math.sin(t * 25)) * 0.6;
      const color = Color3.Lerp(base, charcoal, band);
      colors.push(color.r, color.g, color.b, 1);
    }
    tube.setVerticesData('color', colors);
    sphere(
      this.scene,
      'soft tail tip',
      this.tail,
      this.darkFur,
      points[22],
      new Vector3(0.098, 0.098, 0.098),
      6,
    );
    this.tail.position.set(0, 0.38, -0.46);
  }

  private mergeChildren(parent: TransformNode) {
    const sources = parent
      .getChildren()
      .filter((child): child is Mesh => child instanceof Mesh && Boolean(child.material));
    if (sources.length < 2) return;
    const compatibleGroups = new Map<string, Mesh[]>();
    for (const source of sources) {
      const materialId = source.material?.uniqueId ?? 0;
      const attributes = source.getVerticesDataKinds().sort().join(',');
      const key = `${materialId}:${attributes}`;
      const group = compatibleGroups.get(key) ?? [];
      group.push(source);
      compatibleGroups.set(key, group);
    }
    // Preserve local geometry so each body/head/tail group can still animate as a unit.
    for (const group of compatibleGroups.values()) {
      if (group.length < 2) continue;
      for (const source of group) source.parent = null;
      let merged: Mesh | null;
      try {
        merged = Mesh.MergeMeshes(group, true, true, undefined, false, true);
      } catch (error) {
        console.warn(`Skipped cat mesh batch under ${parent.name}`, error);
        for (const source of group) source.parent = parent;
        continue;
      }
      if (!merged) {
        for (const source of group) source.parent = parent;
        continue;
      }
      merged.name = `${parent.name}-combined-art`;
      merged.parent = parent;
      merged.isPickable = false;
      merged.receiveShadows = false;
    }
  }

  setStations(stations: StationCell[]) {
    this.safe = safeCells(stations);
    this.destinations = spreadCells(this.safe, Math.min(5, this.safe.length), stations);
    const selected = this.destinations[0] ?? this.safe[0] ?? { x: 7, z: 8 };
    this.currentCell = selected;
    this.root.position.set(selected.x - 7, 0, selected.z - 5);
    this.walkingPath = [];
  }

  private chooseDestination() {
    const options = this.destinations.filter(
      (cell) => cell.x !== this.currentCell.x || cell.z !== this.currentCell.z,
    );
    const blocked = new Set<string>();
    // Occupied station tiles are excluded from the cat's visual-only route.
    for (let z = 1; z <= 9; z++)
      for (let x = 1; x <= 13; x++)
        if (!this.safe.some((cell) => cell.x === x && cell.z === z)) blocked.add(`${x},${z}`);
    const reachable = options
      .map((target) => ({ target, path: route(this.currentCell, target, blocked) }))
      .filter(({ path }) => path.length > 0);
    const choice = reachable[Math.floor(Math.random() * reachable.length)];
    if (!choice) {
      this.mood = 'lying';
      this.moodTimer = 4 + Math.random() * 4;
      return;
    }
    this.walkingPath = choice.path;
    this.mood = 'walking';
    this.moodTimer = 0;
  }

  get position() {
    return this.root.position;
  }

  isNear(chef: { x: number; z: number } | undefined) {
    if (!chef) return false;
    return Math.hypot(chef.x - 7 - this.root.position.x, chef.z - 5 - this.root.position.z) <= 1.65;
  }

  pet() {
    this.petTimer = 1.35;
    this.mood = 'sitting';
    this.moodTimer = Math.max(this.moodTimer, 2.4);
  }

  update(dt: number, reducedMotion: boolean, playing: boolean) {
    this.time += dt;
    this.petTimer = Math.max(0, this.petTimer - dt);
    if (this.timeToMeow > 0) this.timeToMeow -= dt;
    if (playing && this.timeToMeow <= 0) {
      this.onMeow();
      this.timeToMeow = 38 + Math.random() * 31;
    }

    if (!playing || reducedMotion) {
      this.mood = 'lying';
      this.posture = 1;
      this.lying = true;
      this.applyPose(0);
      return;
    }

    this.nextBlink -= dt;
    this.blinkTimer = Math.max(0, this.blinkTimer - dt);
    if (this.nextBlink <= 0) {
      this.blinkTimer = 0.18;
      this.nextBlink = 3.5 + Math.random() * 4;
    }
    this.moodTimer -= dt;
    if (this.mood !== 'walking' && this.moodTimer <= 0) {
      const idleChoice = Math.random();
      if (idleChoice < 0.18) {
        this.mood = 'sitting';
        this.moodTimer = 2 + Math.random() * 2.5;
      } else if (idleChoice < 0.4) {
        this.mood = 'lying';
        this.moodTimer = 4 + Math.random() * 4;
      } else this.chooseDestination();
    }
    if (this.mood === 'walking') {
      const next = this.walkingPath[0];
      if (next) {
        const targetX = next.x - 7;
        const targetZ = next.z - 5;
        const dx = targetX - this.root.position.x;
        const dz = targetZ - this.root.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.08) {
          this.root.position.x = targetX;
          this.root.position.z = targetZ;
          this.currentCell = next;
          this.walkingPath.shift();
          if (!this.walkingPath.length) {
            this.mood = Math.random() < 0.6 ? 'lying' : 'sitting';
            this.moodTimer =
              this.mood === 'lying' ? 5 + Math.random() * 5 : 2.5 + Math.random() * 2.5;
          }
        } else {
          const step = Math.min(distance, dt * 0.84);
          this.root.position.x += (dx / distance) * step;
          this.root.position.z += (dz / distance) * step;
          // Turn along the shortest arc. Comparing an unwrapped target angle to
          // the current yaw made the cat spin a full revolution when crossing
          // the -PI/PI boundary (common when it turns around at a path corner).
          const targetYaw = Math.atan2(dx, dz);
          const yawDelta = Math.atan2(
            Math.sin(targetYaw - this.root.rotation.y),
            Math.cos(targetYaw - this.root.rotation.y),
          );
          this.root.rotation.y += Math.sign(yawDelta) * Math.min(Math.abs(yawDelta), dt * 7);
        }
      } else this.chooseDestination();
    }

    const targetPosture = this.mood === 'lying' ? 1 : 0;
    this.posture += (targetPosture - this.posture) * Math.min(1, dt * 2.6);
    this.lying = this.posture > 0.7;
    this.applyPose(dt);
  }

  private applyPose(dt: number) {
    const relax = this.posture;
    const animate = dt > 0;
    const walking = animate && this.mood === 'walking' && !this.lying;
    const breathing = animate ? Math.sin(this.time * 2.3) * 0.008 : 0;
    this.body.position.copyFrom(this.bodyPosition.set(0, 0.47 - relax * 0.17, -0.05));
    this.body.scaling.set(1 + relax * 0.08, 1 - relax * 0.13 + breathing, 1 + relax * 0.06);
    this.head.position.copyFrom(this.headPosition.set(0, 0.77 - relax * 0.22, 0.37 + relax * 0.07));
    for (let index = 0; index < this.legs.length; index++) {
      const leg = this.legs[index];
      const front = index < 2;
      leg.position.y = 0.25 - relax * 0.06;
      leg.position.z = (front ? 0.37 : -0.41) + (front ? 0.12 : 0.05) * relax;
      const phase = index === 0 || index === 3 ? 0 : Math.PI;
      leg.rotation.x = walking ? Math.sin(this.time * 8.5 + phase) * 0.27 : -relax * 0.13;
      leg.scaling.y = 1 - relax * 0.25;
    }
    const happy = animate && this.petTimer > 0;
    this.head.rotation.z = happy ? Math.sin(this.time * 7) * 0.09 : 0;
    this.head.rotation.x = happy ? -0.11 : -0.045;
    const blink = animate && this.blinkTimer > 0 ? Math.sin((this.blinkTimer / 0.18) * Math.PI) : 0;
    for (const eye of this.eyes) eye.scaling.y = Math.max(0.09, (happy ? 0.65 : 1) - blink * 0.92);
    this.tail.position.y = 0.38 - relax * 0.13;
    this.tail.rotation.y = animate
      ? Math.sin(this.time * (happy ? 9 : 1.7)) * (happy ? 0.32 : 0.1)
      : 0;
    this.tail.rotation.x = walking ? Math.sin(this.time * 4.25) * 0.1 : 0;
    this.root.position.y = walking ? Math.abs(Math.sin(this.time * 8.5)) * 0.014 : 0;
    this.contact.position.y = 0.009 - this.root.position.y;
  }
}
