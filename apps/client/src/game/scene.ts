import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Culling/ray';
import { stations } from '../../../../packages/content/src/index';
import {
  getLevel,
  restaurants,
  items,
  dishRecipe,
} from '../../../../packages/content/src/campaign';
import type { Snapshot, Item, Point } from '../../../../packages/shared/src/types';
import { chefColors } from '../multiplayer-ui';

const palette = {
  cream: '#fff2d5',
  teal: '#437e72',
  dark: '#234c45',
  wood: '#d8a96f',
  pink: '#dd826e',
  gold: '#efbb59',
  steel: '#b2cbc5',
  white: '#fffaf0',
  green: '#76ad56',
  brown: '#824b33',
};
export class KitchenScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private layout = stations;
  private levelId = '';
  private kitchenNodes: TransformNode[] = [];
  private materials = new Map<string, StandardMaterial>();
  private shadows: ShadowGenerator;
  private chef: TransformNode;
  private held: TransformNode | null = null;
  private heldKey = '';
  private teammates = new Map<
    string,
    { node: TransformNode; held: TransformNode | null; key: string }
  >();
  private items = new Map<string, { key: string; node: TransformNode }>();
  private guests = new Map<string, TransformNode>();
  private marker: Mesh;
  private targetRadius = 20;
  private state: Snapshot | null = null;
  private playerId = '';
  private time = 0;
  private pointerStart: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private pinched = false;
  private labels: { id: string; node: HTMLElement }[] = [];
  onMove: (p: Point) => void = () => {};
  onInteract: (id: string) => void = () => {};
  constructor(readonly canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.engine.setHardwareScalingLevel(Math.min(2, Math.max(1, window.devicePixelRatio / 1.5)));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString('#dbe6dfff');
    this.camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2.65,
      0.76,
      20,
      new Vector3(0, 0, 0),
      this.scene,
    );
    this.camera.minZ = 0.1;
    this.camera.fov = 0.72;
    const sky = new HemisphericLight('sky', new Vector3(0, 1, 0), this.scene);
    sky.intensity = 0.7;
    sky.groundColor = Color3.FromHexString('#b4bda1');
    const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.45), this.scene);
    sun.position = new Vector3(5, 14, -8);
    sun.intensity = 0.95;
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 16;
    this.buildKitchen();
    this.chef = this.person('chef', palette.teal, true);
    this.chef.position = this.world({ x: 7, z: 8 });
    this.marker = MeshBuilder.CreateTorus(
      'destination',
      { diameter: 0.5, thickness: 0.035, tessellation: 32 },
      this.scene,
    );
    this.marker.material = this.mat(palette.gold);
    this.marker.position.y = 0.035;
    this.marker.isPickable = false;
    this.marker.setEnabled(false);
    canvas.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pointerStart = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      if (this.pointers.size === 2) {
        this.pinched = true;
        this.pinchDistance = this.pointerDistance();
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.pointers.has(e.pointerId))
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const distance = this.pointerDistance();
        this.targetRadius = Math.max(
          13,
          Math.min(60, this.targetRadius - (distance - this.pinchDistance) * 0.035),
        );
        this.pinchDistance = distance;
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      this.pointers.delete(e.pointerId);
      if (
        !this.pinched &&
        this.pointerStart &&
        Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) < 10
      ) {
        const rect = canvas.getBoundingClientRect();
        const pick = this.scene.pick(e.clientX - rect.left, e.clientY - rect.top);
        if (pick?.hit && pick.pickedMesh) {
          let node: any = pick.pickedMesh;
          while (node && !node.metadata?.station) node = node.parent;
          if (node?.metadata?.station) this.onInteract(node.metadata.station);
          else if (pick.pickedPoint) {
            const p = {
              x: Math.round(pick.pickedPoint.x + 7),
              z: Math.round(pick.pickedPoint.z + 5),
            };
            this.onMove(p);
            this.marker.position = this.world(p);
            this.marker.position.y = 0.045;
            this.marker.setEnabled(true);
          }
        }
      }
      if (!this.pointers.size) {
        this.pinched = false;
        this.pointerStart = null;
      }
    });
    canvas.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.pointerStart = null;
      this.pinched = false;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.targetRadius = Math.max(13, Math.min(60, this.targetRadius + e.deltaY * 0.01));
      },
      { passive: false },
    );
    window.addEventListener('resize', () => {
      this.engine.resize();
      this.resetCamera();
    });
    this.resetCamera();
    this.engine.runRenderLoop(() => {
      this.animate();
      this.scene.render();
      this.positionLabels();
    });
  }
  private pointerDistance() {
    const p = [...this.pointers.values()];
    return p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  }
  resetCamera() {
    this.targetRadius = window.innerWidth < 700 ? 48 : 21;
    this.engine.resize();
  }
  private mat(color: string) {
    if (!this.materials.has(color)) {
      const m = new StandardMaterial(color, this.scene);
      m.diffuseColor = Color3.FromHexString(color);
      m.specularColor = new Color3(0.08, 0.08, 0.08);
      this.materials.set(color, m);
    }
    return this.materials.get(color)!;
  }
  private box(
    name: string,
    w: number,
    h: number,
    d: number,
    color: string,
    parent?: TransformNode,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    m.material = this.mat(color);
    m.position.set(x, y, z);
    if (parent) m.parent = parent;
    m.receiveShadows = true;
    this.shadows.addShadowCaster(m);
    return m;
  }
  private sphere(
    name: string,
    size: number,
    color: string,
    parent: TransformNode,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const m = MeshBuilder.CreateSphere(name, { diameter: size, segments: 12 }, this.scene);
    m.material = this.mat(color);
    m.parent = parent;
    m.position.set(x, y, z);
    this.shadows.addShadowCaster(m);
    return m;
  }
  private cylinder(
    name: string,
    d: number,
    h: number,
    color: string,
    parent: TransformNode,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const m = MeshBuilder.CreateCylinder(
      name,
      { diameter: d, height: h, tessellation: 24 },
      this.scene,
    );
    m.material = this.mat(color);
    m.parent = parent;
    m.position.set(x, y, z);
    this.shadows.addShadowCaster(m);
    return m;
  }
  private world(p: Point) {
    return new Vector3(p.x - 7, 0, p.z - 5);
  }
  private buildKitchen() {
    this.kitchenNodes.forEach((n) => n.dispose());
    const before = new Set(this.scene.rootNodes);
    const room = new TransformNode('diner', this.scene);
    this.box('foundation', 15, 0.45, 11, palette.dark, room, 0, -0.27, 0);
    const tiles: Mesh[][] = [[], []];
    for (let x = 0; x < 15; x++)
      for (let z = 0; z < 11; z++) {
        const tile = this.box(
          'tile',
          0.985,
          0.035,
          0.985,
          (x + z) % 2 ? '#e6ddbd' : '#f6efd8',
          room,
          x - 7,
          -0.025,
          z - 5,
        );
        this.shadows.removeShadowCaster(tile);
        tiles[(x + z) % 2].push(tile);
      }
    for (const group of tiles) {
      const floor = Mesh.MergeMeshes(group, true, true);
      if (floor) floor.receiveShadows = true;
    }
    this.box('back wall', 15, 2.1, 0.18, palette.cream, room, 0, 1, -5.5);
    this.box('back trim', 15, 0.78, 0.22, palette.teal, room, 0, 0.39, -5.35);
    this.box('wall rail', 15, 0.1, 0.25, palette.gold, room, 0, 0.8, -5.3);
    this.box('left wall', 0.18, 1, 11, palette.teal, room, -7.5, 0.5, 0);
    for (const x of [-5, 0, 5]) {
      this.box('window frame', 2.8, 1.18, 0.12, palette.wood, room, x, 1.48, -5.35);
      this.box('window sky', 2.6, 1, 0.14, '#b6dbcf', room, x, 1.48, -5.25);
      this.box('mullion', 0.06, 1, 0.17, palette.cream, room, x, 1.48, -5.15);
    }
    for (const def of this.layout) {
      const s = new TransformNode(def.id, this.scene);
      s.metadata = { station: def.id };
      s.position = this.world(def);
      const seat = def.kind === 'seat',
        trash = def.kind === 'trash';
      this.box(
        'cabinet',
        0.94,
        0.73,
        0.94,
        seat ? palette.wood : trash ? palette.dark : palette.teal,
        s,
        0,
        0.4,
        0,
      );
      this.box('worktop', 1.04, 0.12, 1.04, seat ? palette.wood : palette.cream, s, 0, 0.83, 0);
      if (!seat) {
        this.box('door', 0.74, 0.5, 0.025, palette.dark, s, 0, 0.4, 0.48);
        this.box('handle', 0.22, 0.04, 0.06, palette.gold, s, 0, 0.57, 0.51);
      }
      if (def.kind === 'dispenser') {
        this.box('crate', 0.8, 0.2, 0.72, palette.wood, s, 0, 0.98, 0);
        for (const [i, x] of [-0.22, 0.18].entries()) {
          const food = this.food({ id: 'display', kind: def.ingredient!, parts: [] });
          food.parent = s;
          food.position.set(x, 1.05, i * 0.18 - 0.1);
          food.scaling.setAll(0.8);
        }
      }
      if (def.kind === 'stove') {
        this.box('hob', 0.82, 0.06, 0.8, palette.dark, s, 0, 0.93, 0);
        this.cylinder('ring', 0.57, 0.04, palette.steel, s, 0, 0.98, 0);
        this.cylinder('pan', 0.51, 0.1, '#343f3c', s, 0, 1.04, 0);
        this.box('pan handle', 0.12, 0.06, 0.38, palette.brown, s, 0, 1.08, 0.36);
      }
      if (def.kind === 'board') {
        this.box('board', 0.77, 0.045, 0.63, palette.wood, s, 0, 0.93, 0);
        if (def.id === 'mixer')
          this.cylinder('mixing bowl', 0.65, 0.22, palette.steel, s, 0, 1.04, 0);
        else this.box('knife', 0.07, 0.04, 0.36, palette.steel, s, 0.32, 0.98, 0);
      }
      if (def.kind === 'sink') {
        this.box('basin', 0.76, 0.035, 0.7, palette.steel, s, 0, 0.91, 0);
        this.box('water', 0.56, 0.04, 0.5, '#7dc2c5', s, 0, 0.94, 0);
        this.box('tap', 0.08, 0.4, 0.08, palette.steel, s, 0, 1.06, -0.35);
        this.box('spout', 0.08, 0.07, 0.25, palette.steel, s, 0, 1.24, -0.26);
      }
      if (def.kind === 'trash') {
        this.cylinder('bin opening', 0.7, 0.035, '#152d29', s, 0, 0.92, 0);
      }
      if (seat) {
        this.cylinder('stool', 0.65, 0.16, palette.pink, s, 1, 0.48, 0);
        this.cylinder('stool leg', 0.1, 0.45, palette.dark, s, 1, 0.23, 0);
      }
      if (def.kind === 'assembly') {
        this.box('placemat', 0.82, 0.02, 0.72, palette.pink, s, 0, 0.91, 0);
      }
    }
    for (const x of [-6.5, 6.5]) {
      const plant = new TransformNode('plant', this.scene);
      plant.position.set(x, 0, -4.4);
      this.cylinder('pot', 0.5, 0.5, palette.pink, plant, 0, 0.25, 0);
      this.sphere('leaves', 0.7, palette.green, plant, 0, 0.8, 0);
      this.sphere('leaves', 0.5, palette.teal, plant, 0.2, 1.05, 0);
    }
    for (const x of [-3, 2]) {
      const light = new TransformNode('lamp', this.scene);
      light.position.set(x, 0, -3.8);
      this.cylinder('cord', 0.025, 1.1, palette.dark, light, 0, 3.6, 0);
      this.cylinder('shade', 0.8, 0.25, palette.gold, light, 0, 3, 0);
    }
    this.kitchenNodes = this.scene.rootNodes.filter(
      (n) => !before.has(n) && n instanceof TransformNode,
    ) as TransformNode[];
  }
  private person(id: string, color: string, chef = false) {
    const p = new TransformNode(id, this.scene);
    this.sphere('body', 0.61, color, p, 0, 0.62, 0).scaling.y = 1.25;
    this.box('apron', 0.36, 0.45, 0.14, palette.white, p, 0, 0.6, 0.25);
    this.sphere('head', 0.48, '#eab78f', p, 0, 1.14, 0);
    for (const x of [-0.09, 0.09]) this.sphere('eye', 0.046, palette.dark, p, x, 1.18, 0.22);
    this.sphere('nose', 0.08, '#d99b75', p, 0, 1.1, 0.25);
    for (const x of [-0.33, 0.33]) this.sphere('hand', 0.18, '#eab78f', p, x, 0.64, 0.13);
    for (const x of [-0.15, 0.15])
      this.box('shoe', 0.21, 0.17, 0.32, palette.dark, p, x, 0.12, 0.04);
    if (chef) {
      this.cylinder('hat band', 0.46, 0.2, palette.white, p, 0, 1.42, 0);
      for (const x of [-0.16, 0, 0.16]) this.sphere('hat puff', 0.35, palette.white, p, x, 1.57, 0);
    } else this.sphere('hair', 0.49, palette.brown, p, 0, 1.31, -0.055).scaling.y = 0.5;
    return p;
  }
  private food(item: Item) {
    const p = new TransformNode(item.id, this.scene);
    if (['plate', 'dirtyPlate'].includes(item.kind) || !!dishRecipe(item.kind)) {
      this.cylinder('plate', 0.66, 0.06, item.kind === 'dirtyPlate' ? '#b4a68b' : palette.white, p);
      this.cylinder('rim', 0.71, 0.025, palette.cream, p, 0, -0.005, 0);
    }
    if (dishRecipe(item.kind) && item.kind !== 'burger') {
      item.parts.forEach((kind, i) => {
        const child = this.food({ id: 'part', kind, parts: [] });
        child.parent = p;
        child.position.set((i - 1) * 0.16, 0.1 + i * 0.09, 0);
        child.scaling.setAll(0.55);
      });
    } else if (item.kind === 'burger') {
      this.cylinder('bun bottom', 0.45, 0.08, palette.gold, p, 0, 0.08, 0);
      this.cylinder('patty', 0.46, 0.1, palette.brown, p, 0, 0.16, 0);
      this.cylinder('lettuce', 0.51, 0.04, palette.green, p, 0, 0.23, 0);
      this.sphere('bun top', 0.47, palette.gold, p, 0, 0.29, 0).scaling.y = 0.48;
      for (const x of [-0.1, 0.08]) this.sphere('sesame', 0.035, palette.cream, p, x, 0.399, 0.04);
    } else if (item.kind === 'plate') {
      item.parts.forEach((kind, i) => {
        const ingredient = this.food({ id: 'part', kind, parts: [] });
        ingredient.parent = p;
        ingredient.scaling.setAll(0.65);
        ingredient.position.set((i - 1) * 0.14, 0.08, 0);
      });
    } else if (item.kind === 'dirtyPlate') {
      this.cylinder('crumb', 0.24, 0.012, palette.brown, p, 0, 0.04, 0);
    } else if (item.kind === 'lettuce' || item.kind === 'choppedLettuce') {
      for (const x of [-0.12, 0.1])
        this.sphere('leaf', 0.32, palette.green, p, x, 0.1, 0).scaling.y =
          item.kind === 'choppedLettuce' ? 0.35 : 0.8;
    } else if (item.kind === 'bun') {
      this.sphere('bun', 0.45, palette.gold, p, 0, 0.1, 0).scaling.y = 0.55;
    } else {
      this.cylinder(
        'patty',
        0.44,
        0.13,
        items.get(item.kind)?.color ?? (item.kind === 'burnt' ? '#30251f' : palette.brown),
        p,
        0,
        0.08,
        0,
      );
    }
    return p;
  }
  setLabels(labels: { id: string; node: HTMLElement }[]) {
    this.labels = labels;
  }
  update(state: Snapshot, playerId: string) {
    if (state.levelId && state.levelId !== this.levelId) {
      this.levelId = state.levelId;
      const content = getLevel(state.levelId);
      this.layout = content.stations;
      palette.teal = restaurants.find((r) => r.id === content.restaurantId)!.color;
      this.items.forEach((i) => i.node.dispose());
      this.items.clear();
      this.buildKitchen();
    }
    this.state = state;
    this.playerId = playerId;
    const ownSlot = state.session?.members.find((m) => m.id === playerId)?.slot ?? 0;
    const body = this.chef.getChildMeshes().find((m) => m.name === 'body');
    if (body) body.material = this.mat(chefColors[ownSlot]);
    for (const [id, actor] of this.teammates)
      if (!state.chefs[id] || id === playerId) {
        actor.node.dispose();
        this.teammates.delete(id);
      }
    for (const c of Object.values(state.chefs)) {
      if (c.id === playerId) continue;
      let actor = this.teammates.get(c.id);
      if (!actor) {
        const slot = state.session?.members.find((m) => m.id === c.id)?.slot ?? 1;
        const node = this.person(`teammate-${c.id}`, chefColors[slot], true);
        node.position = this.world(c);
        actor = { node, held: null, key: '' };
        this.teammates.set(c.id, actor);
      }
      const signature = JSON.stringify(c.item);
      if (signature !== actor.key) {
        actor.held?.dispose();
        actor.held = null;
        actor.key = signature;
        if (c.item) {
          actor.held = this.food(c.item);
          actor.held.parent = actor.node;
          actor.held.position.set(0, 0.7, 0.49);
        }
      }
      actor.node.getChildMeshes().forEach((m) => (m.visibility = c.connected ? 1 : 0.45));
    }
    const chef = state.chefs[playerId];
    const heldKey = JSON.stringify(chef?.item);
    if (heldKey !== this.heldKey) {
      this.held?.dispose();
      this.held = null;
      this.heldKey = heldKey;
      if (chef?.item) {
        this.held = this.food(chef.item);
        this.held.parent = this.chef;
        this.held.position.set(0, 0.7, 0.49);
      }
    }
    for (const station of state.stations) {
      const item = station.item ?? station.stock.at(-1);
      const id = station.id;
      const signature = JSON.stringify([item, station.stock.length]);
      if (this.items.get(id)?.key !== signature) {
        this.items.get(id)?.node.dispose();
        this.items.delete(id);
        if (item) {
          const node = this.food(item);
          node.metadata = { station: id };
          node.position = this.world(station);
          node.position.y = 1.02;
          if (station.kind === 'rack')
            for (let i = 1; i < station.stock.length; i++)
              this.cylinder('stack', 0.66, 0.04, palette.white, node, 0, -i * 0.045, 0);
          this.items.set(id, { key: signature, node });
        }
      }
    }
    const active = new Set(state.customers.map((c) => c.id));
    for (const [id, node] of this.guests)
      if (!active.has(id)) {
        node.dispose();
        this.guests.delete(id);
      }
    state.customers.forEach((c, i) => {
      let node = this.guests.get(c.id);
      if (!node) {
        const colors = {
          vip: palette.gold,
          impatient: palette.pink,
          complex: '#6797b0',
          combo: '#9a85cb',
          regular: palette.teal,
        };
        node = this.person(c.id, colors[c.type ?? 'regular']);
        if (c.type === 'vip')
          this.cylinder('VIP crown', 0.43, 0.14, palette.gold, node, 0, 1.52, 0);
        this.guests.set(c.id, node);
      }
      const seat = this.layout.find((s) => s.id === c.seat);
      node.metadata = seat ? { station: seat.id } : null;
      if (seat) {
        node.position = this.world(seat);
        node.position.x += 1;
        node.rotation.y = -Math.PI / 2;
      } else {
        node.position.set(6.3, 0, 4 - i * 0.85);
        node.rotation.y = -Math.PI / 2;
      }
    });
  }
  private animate() {
    const dt = Math.min(0.25, this.engine.getDeltaTime() / 1000);
    this.time += dt;
    for (const [id, actor] of this.teammates) {
      const player = this.state?.chefs[id];
      if (!player) continue;
      const target = this.world(player);
      const direction = target.subtract(actor.node.position);
      if (direction.length() > 0.025) actor.node.rotation.y = Math.atan2(direction.x, direction.z);
      actor.node.position = Vector3.Lerp(actor.node.position, target, 1 - Math.exp(-18 * dt));
      actor.node.position.y = player.path.length ? Math.abs(Math.sin(this.time * 13)) * 0.08 : 0;
    }
    if (this.state?.session) {
      for (const member of this.state.session.members) {
        const node = member.id === this.playerId ? this.chef : this.teammates.get(member.id)?.node;
        if (!node) continue;
        const emote = this.state.session.signals.find(
          (s) => s.type === 'emote' && s.from === member.id,
        );
        node.scaling.setAll(emote ? 1 + Math.sin(this.time * 8) * 0.06 : 1);
      }
    }
    const c = this.state?.chefs[this.playerId];
    if (c) {
      const dest = this.world(c);
      const moving = Vector3.Distance(this.chef.position, dest) > 0.025;
      if (moving) {
        const d = dest.subtract(this.chef.position);
        this.chef.rotation.y = Math.atan2(d.x, d.z);
      }
      this.chef.position = Vector3.Lerp(this.chef.position, dest, 1 - Math.exp(-18 * dt));
      this.chef.position.y =
        c.path.length && this.state?.phase === 'playing'
          ? Math.abs(Math.sin(this.time * 13)) * 0.08
          : 0;
      if (!c.path.length) this.marker.setEnabled(false);
      const target = new Vector3((c.x - 7) * 0.14, 0, (c.z - 5) * 0.1);
      this.camera.target =
        Vector3.Distance(this.camera.target, target) < 0.003
          ? target
          : Vector3.Lerp(this.camera.target, target, 1 - Math.exp(-5 * dt));
    }
    this.camera.radius =
      Math.abs(this.targetRadius - this.camera.radius) < 0.003
        ? this.targetRadius
        : this.camera.radius + (this.targetRadius - this.camera.radius) * (1 - Math.exp(-6 * dt));
    if (this.state?.phase === 'playing')
      this.state.customers.forEach((c) => {
        const n = this.guests.get(c.id);
        if (n)
          n.position.y =
            c.state === 'Eating'
              ? Math.sin(this.time * 5) * 0.025
              : Math.sin(this.time * 2) * 0.015;
      });
  }
  private positionLabels() {
    const w = this.engine.getRenderWidth(),
      h = this.engine.getRenderHeight();
    const rect = this.canvas.getBoundingClientRect();
    for (const { id, node } of this.labels) {
      const s = this.layout.find((s) => s.id === id);
      // The HUD can switch levels before the first authoritative snapshot arrives.
      if (!s || !node.isConnected) continue;
      const p = this.world(s);
      p.y = 1.3;
      const v = Vector3.Project(
        p,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        this.camera.viewport.toGlobal(w, h),
      );
      node.style.left = `${Math.round((v.x / w) * rect.width)}px`;
      node.style.top = `${Math.round((v.y / h) * rect.height)}px`;
    }
  }
}
