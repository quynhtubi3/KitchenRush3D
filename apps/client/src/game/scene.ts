import { renderResolution } from './render-resolution';
import { restaurantGraphics } from './restaurant-graphics';
import { RenderCadence, ShadowCadence, renderFrameRate } from './render-cadence';
import { isOpenWorktable, openTableSupport, stationContacts } from './station-grounding';
import {
  characterArtContract,
  materialArchetypes,
  restaurantLighting,
  surfaceFamily,
  visualGroundY,
} from './world-art';
import type { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import {
  chefExpression,
  faceExpressions,
  faceUVs,
  paintFaceAtlas,
  type FaceExpression,
} from './character-face';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Presentation, effectBudget } from './presentation';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { roundedGeometry, copyGeometry } from './rounded-geometry';
import { blinkAmount, customerAppearance } from './character-style';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { ModelAssetLibrary } from './model-assets';
import { pickTouchStation } from '../touch-picking';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Culling/ray';
import { stations } from '../../../../packages/content/src/index';
import { popCore } from './chaotic-pop-theme';
import { getLevel, items, dishRecipe, recipes } from '../../../../packages/content/src/campaign';
import type { Snapshot, Item, Point } from '../../../../packages/shared/src/types';
import { chefColors } from '../multiplayer-ui';
import type { Preferences } from '../preferences';
import {
  buildRestaurant,
  restaurantArt,
  dressStation,
  cuisineFood,
  sharedFloorMaterials,
  floorMaterial,
} from './restaurant-art';
import {
  cylinderSegments,
  latheSegments,
  materialFinish,
  sphereSegments,
  tubeSegments,
} from './geometry-budget';
import {
  cameraFrame as layoutCameraFrame,
  cameraProfile as chooseCameraProfile,
  cameraTarget,
  type CameraFrame,
} from './camera-layout';
import { RestaurantCat } from './restaurant-cat';

const basePalette = {
  cream: popCore.cream,
  teal: popCore.teal,
  dark: popCore.ink,
  wood: '#B95B3E',
  pink: popCore.chili,
  gold: popCore.mustard,
  steel: '#526F89',
  white: popCore.paper,
  green: '#5DAB50',
  brown: popCore.cocoa,
  blush: '#F7AA8B',
  mint: popCore.mint,
  tile: '#F5E8C9',
  grout: '#A99A78',
  ink: popCore.ink,
};

const palette = basePalette;

type CharacterRig = {
  root: TransformNode;
  contact: Mesh;
  torso: TransformNode;
  head: TransformNode;
  leftArm: TransformNode;
  rightArm: TransformNode;
  leftLeg: TransformNode;
  rightLeg: TransformNode;
  face: Mesh;
  faceKey: string;
  blinkOffset: number;
  slots: Record<'hat' | 'hair' | 'apron', TransformNode>;
};
export class KitchenScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly modelAssets: ModelAssetLibrary;
  private layout = stations;
  private levelId = '';
  private restaurantId = 'little-sun';
  private kitchenNodes: TransformNode[] = [];
  private materials = new Map<string, PBRMaterial>();
  private textureMaterials = new Map<string, PBRMaterial>();

  private presentation = new Presentation();
  private rigs = new Map<string, CharacterRig>();
  private effects = new Map<string, Mesh[]>();
  private geometryData = new Map<string, VertexData>();
  private telemetryAt = 0;
  private labelsAt = 0;
  private cameraTelemetryAt = 0;
  private instrumentation: SceneInstrumentation;
  private readonly listeners = new AbortController();
  private readonly resizeObserver: ResizeObserver;
  private readonly cadence = new RenderCadence();
  private frameDeltaMs = 16.67;
  private renderTargetFps = 30;
  private readonly shadowCadence = new ShadowCadence();
  private observedShadowMap: RenderTargetTexture | null = null;
  private shadowRenderedFrames = 0;
  private renderedFrames = 0;
  private sceneBuildAt = 0;
  private sceneBuildMs = 0;
  private sceneReadyMs: number | null = null;
  private readonly touchDevice =
    navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  private readonly movementTarget = new Vector3();
  private readonly renderFrame = () => {
    const now = performance.now();
    const touch = this.touchDevice;
    this.renderTargetFps = renderFrameRate(
      touch,
      this.quality ?? 'standard',
      this.state?.phase === 'playing',
    );
    const dt = this.cadence.step(now, this.renderTargetFps, document.hidden);
    if (dt === null) return;
    this.frameDeltaMs = dt;
    this.animate();
    // Balanced touch shadows update at 10 Hz rather than every display refresh.
    const map = this.shadows.getShadowMap();
    if (map && this.scene.shadowsEnabled) {
      if (map !== this.observedShadowMap) {
        this.observedShadowMap = map;
        map.onAfterRenderObservable.add(() => this.shadowRenderedFrames++);
      }
      this.shadowCadence.update(map, now, touch && this.quality !== 'high');
    }
    this.scene.render();
    if (this.sceneReadyMs === null && this.scene.isReady())
      this.sceneReadyMs = performance.now() - this.sceneBuildAt;
    this.drawSamples[(this.frameIndex + this.drawSamples.length - 1) % this.drawSamples.length] =
      this.instrumentation.drawCallsCounter.current;
    this.renderedFrames++;
    if (now - this.labelsAt >= 66) {
      this.labelsAt = now;
      this.positionLabels();
    }
  };
  private stationHeat = new Map<string, Mesh>();
  private stationHeatStates = new Map<string, string>();
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
  private guestsFed = new Set<string>();
  private cat!: RestaurantCat;
  private catAction!: HTMLButtonElement;
  private catCanPet = false;
  private marker: Mesh;
  private routeDots: Mesh[] = [];
  private interactionMarker: Mesh;
  private interactionStation: string | null = null;
  private cameraFrame: CameraFrame | null = null;
  private targetZoom = 1;
  private cameraZoom = 1;
  private cameraOverview = false;
  private readonly labelProjection = new Vector3();
  private readonly labelWorld = new Vector3();
  private state: Snapshot | null = null;
  private playerId = '';
  private time = 0;
  private reducedMotion = false;
  private sharpness = 'auto';
  private renderDebug = false;
  private showAllStationLabels = false;
  private frameSamples = new Float32Array(240);
  private drawSamples = new Float32Array(240);
  private frameIndex = 0;
  private frameCount = 0;
  private debugPanel = document.createElement('pre');
  private quality: Preferences['quality'] | null = null;
  private pointerStart: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private pinched = false;
  private labels: { id: string; node: HTMLElement }[] = [];
  onMove: (p: Point) => void = () => {};
  onInteract: (id: string) => void = () => {};
  onCatPet: () => void = () => {};
  onCatMeow: () => void = () => {};
  constructor(readonly canvas: HTMLCanvasElement) {
    this.debugPanel.id = 'render-diagnostics';
    this.debugPanel.hidden = true;
    document.body.append(this.debugPanel);
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
    this.engine.onContextLostObservable.add(() => {
      this.canvas.dataset.contextState = 'lost';
    });
    this.engine.onContextRestoredObservable.add(() => {
      this.canvas.dataset.contextState = 'restored';
      this.resetCamera();
    });
    this.scene = new Scene(this.engine);
    // Explicit diagnostic readback in the rendering call; gameplay never reads GPU pixels.
    // Keeping the drawing buffer alive for a later readback would burden every frame.
    canvas.addEventListener(
      'kitchen-read-frame',
      (event) => {
        const read = (event as CustomEvent<() => void>).detail;
        if (typeof read === 'function') this.scene.onAfterRenderObservable.addOnce(read);
      },
      { signal: this.listeners.signal },
    );
    this.modelAssets = new ModelAssetLibrary(this.scene);
    this.instrumentation = new SceneInstrumentation(this.scene);
    this.scene.clearColor = Color4.FromHexString('#e8e7f0ff');
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.toneMappingType =
      ImageProcessingConfiguration.TONEMAPPING_ACES;
    this.scene.imageProcessingConfiguration.exposure = 0.92;
    this.scene.imageProcessingConfiguration.contrast = 1.14;
    this.camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2,
      0.38,
      32,
      new Vector3(0, 0, 0),
      this.scene,
    );
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 160;
    const sky = new HemisphericLight('sky', new Vector3(0, 1, 0), this.scene);
    sky.intensity = 0.48;
    sky.diffuse = Color3.FromHexString('#fff0da');
    sky.groundColor = Color3.FromHexString('#68667b');
    const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.45), this.scene);
    sun.position = new Vector3(5, 14, -8);
    sun.intensity = 1.35;
    sun.diffuse = Color3.FromHexString('#fff0ca');
    sun.specular = Color3.FromHexString('#fff4df');
    this.shadows = new ShadowGenerator(768, sun);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 12;
    this.buildKitchen();
    this.cat = new RestaurantCat(this.scene, this.layout);
    this.cat.onMeow = () => this.onCatMeow();
    this.catAction = document.createElement('button');
    this.catAction.type = 'button';
    this.catAction.className = 'cat-pet-action';
    this.catAction.hidden = true;
    this.catAction.addEventListener('pointerdown', (event) => event.stopPropagation(), {
      signal: this.listeners.signal,
    });
    this.catAction.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        const chef = this.state?.chefs[this.playerId];
        if (!this.catCanPet || this.state?.phase !== 'playing' || !this.cat.isNear(chef)) return;
        this.cat.pet();
        this.onCatPet();
      },
      { signal: this.listeners.signal },
    );
    document.body.append(this.catAction);
    this.chef = this.person('chef', chefColors[0], true).root;
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
    for (let i = 0; i < 16; i++) {
      const dot = MeshBuilder.CreateDisc(
        'route-dot',
        { radius: 0.075, tessellation: 8 },
        this.scene,
      );
      dot.rotation.x = Math.PI / 2;
      dot.material = this.marker.material;
      dot.isPickable = false;
      dot.setEnabled(false);
      this.routeDots.push(dot);
    }
    this.interactionMarker = MeshBuilder.CreateTorus(
      'interaction-focus',
      { diameter: 1.18, thickness: 0.065, tessellation: 24 },
      this.scene,
    );
    this.interactionMarker.material = this.mat('#efad48', 0.52, 0.02);
    this.interactionMarker.position.y = 0.052;
    this.interactionMarker.isPickable = false;
    this.interactionMarker.setEnabled(false);
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.pointerStart = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        if (this.pointers.size === 2) {
          this.pinched = true;
          this.pinchDistance = this.pointerDistance();
        }
      },
      { signal: this.listeners.signal },
    );
    canvas.addEventListener(
      'pointermove',
      (e) => {
        if (this.pointers.has(e.pointerId))
          this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 2) {
          const distance = this.pointerDistance();
          const minimumZoom = 0.82;
          const maximumZoom = (this.cameraFrame?.defaultZoom ?? 1) + 0.36;
          this.targetZoom = Math.max(
            minimumZoom,
            Math.min(maximumZoom, this.targetZoom + (distance - this.pinchDistance) * 0.0015),
          );
          this.applyCameraFrame();
          this.pinchDistance = distance;
        }
      },
      { signal: this.listeners.signal },
    );
    canvas.addEventListener(
      'pointerup',
      (e) => {
        this.pointers.delete(e.pointerId);
        if (
          !this.pinched &&
          this.pointerStart &&
          Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) < 10
        ) {
          const rect = canvas.getBoundingClientRect();
          const pick = this.scene.pick(e.clientX - rect.left, e.clientY - rect.top);
          const touch = e.pointerType !== 'mouse' || window.matchMedia('(pointer: coarse)').matches;
          // On touch screens, forgive small finger placement errors against the
          // projected work surface before a decorative mesh can steal the ray.
          const touchStation = touch ? this.pickTouchStation(e.clientX, e.clientY, rect) : null;
          let node: any = pick?.pickedMesh;
          while (node && !node.metadata?.station) node = node.parent;
          if (touchStation) {
            this.onInteract(touchStation);
          } else if (node?.metadata?.station) {
            this.onInteract(node.metadata.station);
          } else {
            if (pick?.hit && pick.pickedPoint) {
              const p = {
                x: Math.max(1, Math.min(13, Math.round(pick.pickedPoint.x + 7))),
                z: Math.max(1, Math.min(9, Math.round(pick.pickedPoint.z + 5))),
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
      },
      { signal: this.listeners.signal },
    );
    canvas.addEventListener(
      'pointercancel',
      (e) => {
        this.pointers.delete(e.pointerId);
        this.pointerStart = null;
        this.pinched = false;
      },
      { signal: this.listeners.signal },
    );
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const minimumZoom = 0.82;
        const maximumZoom = (this.cameraFrame?.defaultZoom ?? 1) + 0.36;
        this.targetZoom = Math.max(
          minimumZoom,
          Math.min(maximumZoom, this.targetZoom - e.deltaY * 0.00045),
        );
        this.applyCameraFrame();
      },
      { passive: false, signal: this.listeners.signal },
    );
    this.resizeObserver = new ResizeObserver(() => {
      this.resetCamera();
    });
    this.resizeObserver.observe(canvas);
    window.addEventListener(
      'resize',
      () => {
        this.engine.resize();
        this.resetCamera();
      },
      { signal: this.listeners.signal },
    );
    this.engine.renderEvenInBackground = false;
    document.addEventListener(
      'visibilitychange',
      () => {
        this.cadence.reset();
        if (document.hidden) this.engine.stopRenderLoop(this.renderFrame);
        else this.engine.runRenderLoop(this.renderFrame);
      },
      { signal: this.listeners.signal },
    );
    this.resetCamera();
    this.engine.runRenderLoop(this.renderFrame);
  }
  dispose() {
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.debugPanel.remove();
    this.catAction.remove();
    this.engine.stopRenderLoop(this.renderFrame);
    this.modelAssets.dispose();
    this.instrumentation.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
  /** Offline art review only. Never called by gameplay; no invented server snapshots. */
  async renderArtStudy(mode: 'faces' | 'food' | 'customers' | 'equipment') {
    this.engine.stopRenderLoop(this.renderFrame);
    this.resizeObserver.disconnect();
    for (const mesh of [...this.scene.meshes]) mesh.setEnabled(false);
    this.scene.shadowsEnabled = false;
    this.camera.beta = mode === 'food' ? 0.4 : mode === 'equipment' ? 0.65 : 1.0;
    this.camera.target.set(0, 0.95, 0);
    this.camera.orthoLeft = -7.5;
    this.camera.orthoRight = 7.5;
    const studyHeight = (15 * this.canvas.clientHeight) / Math.max(1, this.canvas.clientWidth);
    this.camera.orthoTop = studyHeight / 2;
    this.camera.orthoBottom = -studyHeight / 2;
    if (mode === 'equipment') {
      this.scene.getMeshByName('hand-laid checker terrazzo')?.setEnabled(true);
      this.layout = getLevel('little-sun-10').stations;
      this.buildStations();
    } else if (mode === 'food') {
      const kinds = recipes.map(
        (recipe) => recipe.steps.find((step) => step.station === 'assembly')!.output,
      );
      kinds.forEach((kind, i) => {
        const food = this.food({ id: `study-food-${i}`, kind, parts: [] });
        food.position.set((2 - (i % 5)) * 1.8, 0.8, (Math.floor(i / 5) - 2) * 1.3);
      });
    } else {
      const moods = mode === 'faces' ? faceExpressions : faceExpressions.slice(0, 4);
      moods.forEach((mood, i) => {
        const rig = this.person(`study-${i}`, chefColors[i % 4], mode === 'faces');
        rig.root.position.set((1.5 - (i % 4)) * 2.8, 0, Math.floor(i / 4) * 6.4 - 3.2);
        this.animateFace(rig, mood, false);
      });
    }
    this.applyResolution();
    await this.scene.whenReadyAsync();
    this.scene.render();
    this.canvas.dataset.studyReady = mode;
  }
  private pointerDistance() {
    const p = [...this.pointers.values()];
    return p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  }
  resetCamera() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const touch = this.touchDevice;
    // Determine orientation from the device viewport, not the HUD-reserved canvas.
    // A portrait canvas can be nearly square after reserving touch controls.
    const profile = chooseCameraProfile(window.innerWidth, window.innerHeight, touch);
    this.cameraFrame = layoutCameraFrame(rect.width, rect.height, profile);
    this.camera.alpha = Math.PI / 2;
    this.camera.beta = 0.38;
    this.camera.radius = 32;
    this.targetZoom = this.cameraZoom = this.cameraOverview
      ? this.cameraFrame.overviewZoom
      : this.cameraFrame.defaultZoom;
    document.body.dataset.cameraProfile = profile;
    document.body.dataset.cameraFocus = this.cameraOverview ? 'overview' : 'chef';
    this.applyCameraFrame();
    this.applyResolution();
  }
  private applyCameraFrame() {
    if (!this.cameraFrame) return;
    const width = this.cameraFrame.width / this.targetZoom;
    const height = this.cameraFrame.height / this.targetZoom;
    this.camera.orthoLeft = -width / 2;
    this.camera.orthoRight = width / 2;
    this.camera.orthoTop = height / 2;
    this.camera.orthoBottom = -height / 2;
    this.cameraZoom = this.targetZoom;
  }
  setInteractionTarget(stationId: string | null) {
    if (stationId === this.interactionStation) return;
    this.interactionStation = stationId;
    const station = stationId && this.layout.find((candidate) => candidate.id === stationId);
    if (!station) {
      this.interactionMarker.setEnabled(false);
      return;
    }
    this.interactionMarker.position.copyFrom(this.world(station));
    this.interactionMarker.position.y = 0.052;
    this.interactionMarker.setEnabled(true);
  }
  toggleCameraView() {
    this.cameraOverview = !this.cameraOverview;
    this.targetZoom = this.cameraOverview
      ? (this.cameraFrame?.overviewZoom ?? 0.96)
      : (this.cameraFrame?.defaultZoom ?? 1);
    this.applyCameraFrame();
    if (this.cameraOverview) this.camera.target.set(0, 0, 0);
    document.body.dataset.cameraFocus = this.cameraOverview ? 'overview' : 'chef';
  }
  get isCameraOverview() {
    return this.cameraOverview;
  }
  configure(preferences: Preferences) {
    this.reducedMotion = preferences.reducedMotion;
    this.quality = preferences.quality;
    this.sharpness = preferences.sharpness;
    this.renderDebug = preferences.renderDebug;
    this.showAllStationLabels = preferences.showAllStationLabels;
    this.debugPanel.hidden = !this.renderDebug;
    this.scene.shadowsEnabled = preferences.quality !== 'low';
    const touch = this.touchDevice;
    this.shadows.useBlurExponentialShadowMap = !(touch && preferences.quality !== 'high');
    this.shadows.usePoissonSampling = touch && preferences.quality !== 'high';
    this.shadows.mapSize = touch && preferences.quality !== 'high' ? 512 : 768;
    this.shadows.bias = 0.001;
    this.shadows.normalBias = 0.025;
    this.cadence.reset();
    this.applyResolution();
  }
  setCatPlayerName(displayName: string, language: 'vi' | 'en') {
    this.catCanPet = displayName.toLocaleLowerCase('vi').includes('hoa');
    this.catAction.disabled = !this.catCanPet;
    this.catAction.textContent = language === 'vi' ? '🐾 Nựng Kẹo' : '🐾 Pet Kẹo';
    this.catAction.setAttribute('aria-label', language === 'vi' ? 'Nựng Kẹo' : 'Pet Kẹo the cat');
  }
  private applyResolution() {
    const rect = this.canvas.getBoundingClientRect();
    const resolution = renderResolution(
      rect.width,
      rect.height,
      window.devicePixelRatio,
      this.quality ?? 'standard',
      this.sharpness,
    );
    if (this.engine.getHardwareScalingLevel() !== resolution.hardwareScalingLevel)
      this.engine.setHardwareScalingLevel(resolution.hardwareScalingLevel);
    this.engine.resize();
  }

  private mat(color: string, roughness = 0.76, metallic = 0.02) {
    const finish = materialFinish(roughness, metallic);
    const key = `${color}:${finish.roughness}:${finish.metallic}`;
    if (!this.materials.has(key)) {
      const m = new PBRMaterial(key, this.scene);
      m.albedoColor = Color3.FromHexString(color);
      m.roughness = finish.roughness;
      m.metallic = finish.metallic;
      m.environmentIntensity = 0.35;
      this.materials.set(key, m);
    }
    return this.materials.get(key)!;
  }
  private surface(
    name: string,
    color: string,
    parent?: TransformNode,
    roughness = 0.76,
    metallic = 0.02,
  ) {
    let node = parent;
    let food = false;
    while (node) {
      if (node.metadata?.visualFood) {
        food = true;
        break;
      }
      node = node.parent as TransformNode | undefined;
    }
    const family = surfaceFamily(name, food);
    const finish = family ? materialArchetypes[family] : { roughness, metallic };
    return this.mat(color, finish.roughness, finish.metallic);
  }
  private roundedBox(
    name: string,
    w: number,
    h: number,
    d: number,
    radius: number,
    color: string,
    parent?: TransformNode,
    x = 0,
    y = 0,
    z = 0,
    roughness = 0.74,
    metallic = 0.02,
  ) {
    const mesh = new Mesh(name, this.scene);
    const geometryKey = `${w}/${h}/${d}/${radius}`;
    let data = this.geometryData.get(geometryKey);
    if (!data) {
      data = roundedGeometry(w, h, d, radius);
      this.geometryData.set(geometryKey, data);
    }
    // MergeMeshes can transform extracted arrays in place. Never share the cached backing arrays.
    copyGeometry(data).applyToMesh(mesh, false);
    mesh.material = this.surface(name, color, parent, roughness, metallic);
    mesh.position.set(x, y, z);
    if (parent) mesh.parent = parent;
    mesh.receiveShadows = true;
    if (name === 'open table leg' || (Math.max(w, h, d) > 0.3 && w * h * d > 0.018))
      this.shadows.addShadowCaster(mesh);
    return mesh;
  }
  private dinerFloorMaterial() {
    return floorMaterial(this.scene, 'little-sun');
  }
  private wallpaperMaterial() {
    const existing = this.textureMaterials.get('wallpaper');
    if (existing) return existing;
    const texture = new DynamicTexture(
      'little-sun-wallpaper',
      { width: 512, height: 512 },
      this.scene,
      false,
    );
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = '#FFF1D2';
    ctx.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 64) {
      ctx.fillStyle = '#DCA94C';
      ctx.fillRect(x, 0, 2, 512);
      for (let y = 0; y < 512; y += 64) {
        ctx.fillStyle = '#F4513D';
        ctx.beginPath();
        ctx.arc(x + 32, y + 32, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFC72C';
        ctx.beginPath();
        ctx.arc(x + 32, y + 32, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFF9E9';
        for (let petal = 0; petal < 8; petal++) {
          const angle = (petal / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(
            x + 32 + Math.cos(angle) * 10,
            y + 32 + Math.sin(angle) * 10,
            4,
            2.3,
            angle,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }
    texture.uScale = 7;
    texture.update(false);

    const material = new PBRMaterial('little-sun-daisy-wallpaper', this.scene);
    material.albedoTexture = texture;
    material.roughness = 0.92;
    material.metallic = 0;
    this.textureMaterials.set('wallpaper', material);
    return material;
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
    m.material = this.surface(name, color, parent);
    m.position.set(x, y, z);
    if (parent) m.parent = parent;
    m.receiveShadows = true;
    if (Math.max(w, h, d) > 0.3 && w * h * d > 0.018) this.shadows.addShadowCaster(m);
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
    const m = MeshBuilder.CreateSphere(
      name,
      { diameter: size, segments: sphereSegments(size) },
      this.scene,
    );
    m.material = this.surface(name, color, parent);
    m.parent = parent;
    m.position.set(x, y, z);
    if (size > 0.14) this.shadows.addShadowCaster(m);
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
    roughness = 0.76,
    metallic = 0.02,
  ) {
    const m = MeshBuilder.CreateCylinder(
      name,
      { diameter: d, height: h, tessellation: cylinderSegments(d) },
      this.scene,
    );
    m.material = this.surface(name, color, parent, roughness, metallic);
    m.parent = parent;
    m.position.set(x, y, z);
    if (d > 0.16) this.shadows.addShadowCaster(m);
    return m;
  }
  private capsule(
    name: string,
    height: number,
    radius: number,
    color: string,
    parent: TransformNode,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const mesh = MeshBuilder.CreateCapsule(
      name,
      { height, radius, tessellation: 12, capSubdivisions: 4, subdivisions: 2 },
      this.scene,
    );
    mesh.material = this.surface(name, color, parent, 0.92, 0);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    this.shadows.addShadowCaster(mesh);
    return mesh;
  }
  private tube(
    name: string,
    points: Vector3[],
    radius: number,
    color: string,
    parent: TransformNode,
    metallic = 0,
  ) {
    const mesh = MeshBuilder.CreateTube(
      name,
      { path: points, radius, tessellation: tubeSegments(radius), cap: Mesh.CAP_ALL },
      this.scene,
    );
    mesh.material = this.surface(name, color, parent, metallic ? 0.28 : 0.82, metallic);
    mesh.parent = parent;
    if (radius > 0.027) this.shadows.addShadowCaster(mesh);
    return mesh;
  }
  private lathe(
    name: string,
    profile: Vector3[],
    color: string,
    parent: TransformNode,
    x = 0,
    y = 0,
    z = 0,
    roughness = 0.72,
    metallic = 0.02,
  ) {
    const mesh = MeshBuilder.CreateLathe(
      name,
      {
        shape: profile,
        tessellation: latheSegments(profile.length),
        sideOrientation: Mesh.DOUBLESIDE,
      },
      this.scene,
    );
    mesh.material = this.surface(name, color, parent, roughness, metallic);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    const widest = Math.max(...profile.map((point) => point.x));
    if (widest > 0.22) this.shadows.addShadowCaster(mesh);
    return mesh;
  }
  private leaf(
    name: string,
    color: string,
    parent: TransformNode,
    x = 0,
    y = 0,
    z = 0,
    angle = 0,
    scale = 1,
  ) {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row < 5; row++) {
      const t = (row / 4) * 2 - 1;
      const width = Math.sin(((t + 1) / 2) * Math.PI) * 0.14 * scale;
      for (let side = -1; side <= 1; side++) {
        const ridge = side === 0;
        positions.push(
          t * 0.27 * scale,
          ridge ? Math.sin(((t + 1) / 2) * Math.PI) * 0.045 * scale : 0,
          side * width,
        );
        const tint = ridge ? [0.9, 1, 0.68] : [0.72, 0.88, 0.57];
        colors.push(...tint, 1);
      }
    }
    for (let row = 0; row < 4; row++) {
      const a = row * 3;
      const next = a + 3;
      indices.push(a, next, a + 1, a + 1, next, next + 1);
      indices.push(a + 1, next + 1, a + 2, a + 2, next + 1, next + 2);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.colors = colors;
    data.indices = indices;
    const mesh = new Mesh(name, this.scene);
    data.applyToMesh(mesh, false);
    mesh.material = this.mat(color, 0.88, 0);
    mesh.material.backFaceCulling = false;
    mesh.useVertexColors = true;
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.rotation.y = angle;
    return mesh;
  }
  private world(p: Point) {
    return new Vector3(p.x - 7, 0, p.z - 5);
  }
  private pickTouchStation(clientX: number, clientY: number, rect: DOMRect) {
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    if (width < 1 || height < 1 || rect.width < 1 || rect.height < 1) return null;

    const viewport = this.camera.viewport.toGlobal(width, height);
    const transform = this.scene.getTransformMatrix();
    const targets = this.layout.flatMap((station) => {
      // Match the actual work surface, not the label or the station's floor tile.
      this.labelWorld.set(station.x - 7, 1.08, station.z - 5);
      Vector3.ProjectToRef(
        this.labelWorld,
        Matrix.IdentityReadOnly,
        transform,
        viewport,
        this.labelProjection,
      );
      if (this.labelProjection.z < 0 || this.labelProjection.z > 1) return [];
      return [
        {
          id: station.id,
          x: rect.left + (this.labelProjection.x / width) * rect.width,
          y: rect.top + (this.labelProjection.y / height) * rect.height,
        },
      ];
    });
    return pickTouchStation(clientX, clientY, targets);
  }
  private buildKitchen() {
    this.sceneBuildAt = performance.now();
    this.sceneReadyMs = null;
    const lighting = restaurantLighting(this.restaurantId);
    const sky = this.scene.getLightByName('sky') as HemisphericLight;
    const sun = this.scene.getLightByName('sun') as DirectionalLight;
    sky.intensity = lighting.fill;
    sky.diffuse = Color3.FromHexString(lighting.fillColor);
    sky.groundColor = Color3.FromHexString(lighting.ground);
    sun.intensity = lighting.key;
    sun.diffuse = Color3.FromHexString(lighting.keyColor);
    sun.specular = Color3.FromHexString('#fff7ee');
    sun.direction.set(-0.32, -1, 0.28);
    this.shadows.setDarkness(lighting.shadow);
    this.effects.clear();
    this.stationHeat.clear();
    this.stationHeatStates.clear();
    const oldMaterials = new Set(
      this.kitchenNodes.flatMap((n) => n.getChildMeshes().map((m) => m.material)),
    );
    const cached = new Set([...this.materials.values(), ...this.textureMaterials.values()]);
    for (const material of sharedFloorMaterials(this.scene)) cached.add(material);
    this.kitchenNodes.forEach((n) => n.dispose());
    this.kitchenNodes = [];
    for (const material of oldMaterials)
      if (material && !cached.has(material as PBRMaterial)) material.dispose(false, true);
    this.stationHeat.clear();
    this.stationHeatStates.clear();
    if (this.restaurantId === 'little-sun') this.buildLittleSunKitchen();
    else this.buildGenericKitchen();
    for (const root of this.kitchenNodes) this.batchStatic(root);
    // Warm effect materials before animation so the frame loop only hits the cache.
    for (const color of [
      '#F4513D',
      '#65C9DB',
      '#FFC72C',
      '#8BE0BD',
      '#3C4960',
      '#F07B32',
      '#6937C8',
    ])
      this.mat(color);
    for (const def of this.layout) {
      const root = new TransformNode(`effect-${def.id}`, this.scene);
      root.position = this.world(def);
      this.kitchenNodes.push(root);
      const particles = Array.from({ length: 3 }, (_, i) => {
        const mesh =
          def.kind === 'board' && def.id !== 'mixer' && i === 0
            ? this.roundedBox(
                'chopping blade',
                0.28,
                0.15,
                0.025,
                0.015,
                '#b8c8c6',
                root,
                0,
                1.3,
                0,
              )
            : i === 2
              ? this.comicBurst(root)
              : this.sphere('steam puff', 0.14, '#f0e7d8', root, (i - 1) * 0.13, 1.4 + i * 0.2, 0);
        mesh.isPickable = false;
        this.shadows.removeShadowCaster(mesh);
        mesh.setEnabled(false);
        return mesh;
      });
      this.effects.set(def.id, particles);
    }
    this.sceneBuildMs = performance.now() - this.sceneBuildAt;
  }
  /** Merge only static meshes with the same material, preserving the station parent for picking. */
  private comicBurst(parent: TransformNode) {
    const mesh = new Mesh('comic completion burst', this.scene);
    const data = new VertexData(),
      positions = [0, 0, 0],
      indices: number[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        r = i % 2 ? 0.08 : 0.24;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      indices.push(0, i + 1, ((i + 1) % 16) + 1);
    }
    data.positions = positions;
    data.indices = indices;
    data.normals = [];
    VertexData.ComputeNormals(positions, indices, data.normals);
    data.applyToMesh(mesh);
    mesh.parent = parent;
    mesh.material = this.mat('#FFC72C');
    mesh.position.y = 1.16;
    return mesh;
  }
  private batchStatic(root: TransformNode, direct = false) {
    const groups = new Map<string, Mesh[]>();
    for (const mesh of root.getChildMeshes(direct)) {
      if (
        !(mesh instanceof Mesh) ||
        !mesh.material ||
        [...this.stationHeat.values()].includes(mesh)
      )
        continue;
      const material = mesh.material as PBRMaterial;
      // Mesh.MergeMeshes requires every source to expose the same vertex streams.
      // Material alone is not a sufficient batch key (custom decals/props may omit UVs).
      const attributes = mesh.getVerticesDataKinds().sort().join(',');
      const key = `${material.uniqueId}:${attributes}`;
      const group = groups.get(key) ?? [];
      group.push(mesh);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const team = group.some(
        (m) =>
          m.name === 'body' ||
          m.name === 'rounded jacket shoulder' ||
          m.name.includes('puff sleeve'),
      );
      const pickable = group.some((m) => m.isPickable);
      const casters = group.filter((m) => this.shadows.getShadowMap()?.renderList?.includes(m));
      group.forEach((m) => {
        m.computeWorldMatrix(true);
        this.shadows.removeShadowCaster(m);
      });
      let mesh: Mesh | null;
      try {
        mesh = Mesh.MergeMeshes(group, true, true);
      } catch (error) {
        // A malformed optional art batch must not prevent the kitchen from loading.
        console.warn(`Skipped static mesh batch under ${root.name}`, error);
        casters.forEach((caster) => this.shadows.addShadowCaster(caster));
        continue;
      }
      if (mesh) {
        mesh.name = team ? 'team-coat' : `${root.name}-batch`;
        mesh.setParent(root);
        mesh.isPickable = pickable;
        mesh.receiveShadows = true;
        if (casters.length) this.shadows.addShadowCaster(mesh);
      } else casters.forEach((caster) => this.shadows.addShadowCaster(caster));
    }
  }
  private buildLittleSunKitchen() {
    this.kitchenNodes.forEach((node) => node.dispose());
    this.stationHeat.clear();
    const before = new Set(this.scene.rootNodes);
    const room = new TransformNode('little-sun-diner', this.scene);
    this.roundedBox('diner foundation', 15, 0.48, 11, 0.16, palette.dark, room, 0, -0.27, 0);
    const floor = MeshBuilder.CreateGround(
      'hand-laid checker terrazzo',
      { width: 15, height: 11, subdivisions: 1 },
      this.scene,
    );
    floor.position.y = visualGroundY;
    floor.parent = room;
    floor.material = this.dinerFloorMaterial();
    floor.receiveShadows = true;
    floor.isPickable = true;
    restaurantGraphics(this.art(), room, 'little-sun');

    this.roundedBox('back wall', 15, 2.7, 0.2, 0.06, '#F5D27B', room, 0, 1.15, -5.55);
    const paper = this.box(
      'daisy print wallpaper',
      14.82,
      1.58,
      0.05,
      '#FFF1D2',
      room,
      0,
      1.7,
      -5.42,
    );
    paper.material = this.wallpaperMaterial();
    this.roundedBox(
      'teal diner wainscot',
      15,
      0.78,
      0.24,
      0.04,
      palette.teal,
      room,
      0,
      0.39,
      -5.34,
    );
    this.roundedBox(
      'brass picture rail',
      15,
      0.1,
      0.27,
      0.035,
      palette.gold,
      room,
      0,
      0.82,
      -5.29,
      0.3,
      0.58,
    );
    this.roundedBox('baseboard', 15, 0.12, 0.3, 0.04, '#173e3b', room, 0, 0.08, -5.29);
    this.roundedBox('left wall', 0.2, 1.25, 11, 0.06, palette.teal, room, -7.5, 0.6, 0);
    this.roundedBox(
      'left wall rail',
      0.27,
      0.11,
      11,
      0.04,
      palette.gold,
      room,
      -7.43,
      0.88,
      0,
      0.3,
      0.5,
    );

    const glassTexture = new DynamicTexture(
      'little-sun-morning-windows',
      { width: 512, height: 256 },
      this.scene,
      false,
    );
    const glass = glassTexture.getContext() as unknown as CanvasRenderingContext2D;
    const skyGradient = glass.createLinearGradient(0, 0, 0, 256);
    skyGradient.addColorStop(0, '#9bd0e1');
    skyGradient.addColorStop(0.62, '#d6e6d0');
    skyGradient.addColorStop(1, '#edca8d');
    glass.fillStyle = skyGradient;
    glass.fillRect(0, 0, 512, 256);
    glass.fillStyle = '#fff2ca';
    glass.beginPath();
    glass.arc(395, 63, 31, 0, Math.PI * 2);
    glass.fill();
    glass.fillStyle = '#f8fbefaa';
    for (const [x, y, r] of [
      [86, 59, 28],
      [110, 53, 34],
      [139, 62, 23],
      [257, 31, 19],
      [276, 28, 23],
      [296, 36, 16],
    ]) {
      glass.beginPath();
      glass.arc(x, y, r, 0, Math.PI * 2);
      glass.fill();
    }
    glass.fillStyle = '#8aaf8a';
    glass.fillRect(0, 184, 512, 72);
    glass.fillStyle = '#6d9581';
    for (let x = 12; x < 530; x += 47) {
      const height = 25 + ((x * 7) % 35);
      glass.fillRect(x, 184 - height, 28, height);
      glass.fillStyle = '#e6d39e';
      glass.fillRect(x + 5, 165 - height, 4, 5);
      glass.fillRect(x + 17, 165 - height, 4, 5);
      glass.fillStyle = '#6d9581';
    }
    glass.fillStyle = '#5a806b';
    glass.fillRect(0, 201, 512, 55);
    glassTexture.update(false);

    const glassMaterial = new PBRMaterial('sunlit window glass', this.scene);
    glassMaterial.albedoTexture = glassTexture;
    glassMaterial.roughness = 0.35;
    glassMaterial.metallic = 0;
    glassMaterial.alpha = 0.94;
    for (const x of [-5, 0, 5]) {
      this.roundedBox(
        'curved oak window frame',
        2.84,
        1.24,
        0.15,
        0.1,
        palette.wood,
        room,
        x,
        1.52,
        -5.31,
      );
      const pane = this.roundedBox(
        'morning glass',
        2.54,
        0.94,
        0.055,
        0.055,
        '#b4d7d2',
        room,
        x,
        1.52,
        -5.195,
      );
      pane.material = glassMaterial;
      this.roundedBox('window lower sill', 2.98, 0.12, 0.26, 0.045, '#f5d590', room, x, 0.91, -5.2);
      this.roundedBox('window mullion', 0.055, 0.94, 0.08, 0.025, '#f7e8c9', room, x, 1.52, -5.12);
      this.roundedBox('window crossbar', 2.54, 0.045, 0.08, 0.02, '#f7e8c9', room, x, 1.49, -5.12);
    }

    this.roundedBox(
      'sun sign enamel',
      3.7,
      0.68,
      0.17,
      0.16,
      palette.teal,
      room,
      0,
      2.45,
      -5.22,
      0.32,
      0.14,
    );
    const signTexture = new DynamicTexture(
      'little-sun-lettering',
      { width: 768, height: 144 },
      this.scene,
      false,
    );
    const sign = signTexture.getContext() as unknown as CanvasRenderingContext2D;
    sign.clearRect(0, 0, 768, 144);
    sign.fillStyle = '#fff1d6';
    sign.font = '800 66px "Trebuchet MS", sans-serif';
    sign.textAlign = 'center';
    sign.textBaseline = 'middle';
    sign.fillText('LITTLE SUN', 384, 77);
    signTexture.update();

    const signMaterial = new PBRMaterial('little-sun sign lettering', this.scene);
    signMaterial.albedoTexture = signTexture;
    signMaterial.emissiveColor = Color3.FromHexString('#251d12');
    signMaterial.roughness = 0.8;
    signTexture.hasAlpha = true;
    signMaterial.useAlphaFromAlbedoTexture = true;
    signMaterial.backFaceCulling = false;
    const letters = MeshBuilder.CreatePlane(
      'little-sun sign face',
      { width: 3.34, height: 0.52 },
      this.scene,
    );
    letters.parent = room;
    letters.position.set(0, 2.45, -5.08);
    letters.rotation.y = Math.PI;
    letters.material = signMaterial;
    letters.isPickable = false;

    const sunBadge = new TransformNode('sun badge', this.scene);
    sunBadge.parent = room;
    sunBadge.position.set(-2.13, 2.45, -5.08);
    this.sphere('sun center', 0.25, palette.gold, sunBadge, 0, 0, 0);
    for (let ray = 0; ray < 12; ray++) {
      const angle = (ray / 12) * Math.PI * 2;
      this.roundedBox(
        'sun ray',
        0.055,
        0.14,
        0.045,
        0.02,
        palette.gold,
        sunBadge,
        Math.cos(angle) * 0.22,
        Math.sin(angle) * 0.22,
        0,
      ).rotation.z = angle - Math.PI / 2;
    }

    this.buildStations();

    for (const x of [-6.5, 6.5]) {
      const plant = new TransformNode('sunroom fern planter', this.scene);
      plant.parent = room;
      plant.position.set(x, 0, -4.34);
      this.lathe(
        'glazed terracotta pot',
        [
          new Vector3(0.16, 0),
          new Vector3(0.25, 0.08),
          new Vector3(0.32, 0.42),
          new Vector3(0.36, 0.47),
          new Vector3(0.3, 0.49),
          new Vector3(0.29, 0.42),
        ],
        '#cc7655',
        plant,
        0,
        0.03,
        0,
        0.82,
      );
      this.cylinder('pot rim glaze', 0.72, 0.07, '#e1a171', plant, 0, 0.49, 0, 0.76, 0);
      for (let leaf = 0; leaf < 7; leaf++) {
        const angle = (leaf / 7) * Math.PI * 2;
        const frond = this.capsule(
          'broad fern frond',
          0.78,
          0.11,
          leaf % 2 ? '#719b56' : '#89ae67',
          plant,
          Math.cos(angle) * 0.11,
          0.88,
          Math.sin(angle) * 0.11,
        );
        frond.rotation.z = Math.cos(angle) * 0.62;
        frond.rotation.x = Math.sin(angle) * 0.62;
      }
      this.sphere('fern heart', 0.34, '#5b8751', plant, 0, 1.04, 0);
    }
    for (const x of [-3.2, 2.2]) {
      const lamp = new TransformNode('brass pendant', this.scene);
      lamp.parent = room;
      lamp.position.set(x, 0, -3.7);
      this.tube(
        'fabric pendant cord',
        [new Vector3(0, 4.5, 0), new Vector3(0, 3.68, 0)],
        0.022,
        '#526e64',
        lamp,
      );
      this.lathe(
        'enameled scallop pendant shade',
        [
          new Vector3(0, 0),
          new Vector3(0.13, 0.02),
          new Vector3(0.28, 0.13),
          new Vector3(0.47, 0.2),
          new Vector3(0.5, 0.24),
          new Vector3(0.44, 0.27),
          new Vector3(0.3, 0.24),
          new Vector3(0.18, 0.19),
          new Vector3(0, 0.18),
        ],
        '#e5a84e',
        lamp,
        0,
        3.23,
        0,
        0.35,
        0.14,
      );
      const bulb = this.sphere('milk glass pendant bulb', 0.19, '#fff1d1', lamp, 0, 3.16, 0);
      const material = this.mat('#fff1d1', 0.35, 0);
      material.emissiveColor = Color3.FromHexString('#dba968');
      bulb.material = material;
      this.cylinder('pendant finial', 0.12, 0.1, '#b7783e', lamp, 0, 3.52, 0, 0.3, 0.52);
    }
    for (const x of [-6.25, 6.25]) {
      this.cylinder(
        'wall clock rim',
        0.8,
        0.13,
        '#b47445',
        room,
        x,
        1.75,
        -5.19,
        0.44,
        0.34,
      ).rotation.x = Math.PI / 2;
      this.cylinder(
        'wall clock face',
        0.68,
        0.07,
        '#fff1d2',
        room,
        x,
        1.75,
        -5.105,
        0.74,
        0,
      ).rotation.x = Math.PI / 2;
      for (let tick = 0; tick < 12; tick++) {
        const angle = (tick / 12) * Math.PI * 2;
        this.sphere(
          'clock hour marker',
          0.055,
          '#8a5a3c',
          room,
          x + Math.cos(angle) * 0.25,
          1.75 + Math.sin(angle) * 0.25,
          -5.05,
        );
      }
      this.tube(
        'clock hands',
        [new Vector3(x, 1.75, -5.035), new Vector3(x + 0.12, 1.89, -5.03)],
        0.018,
        '#63483c',
        room,
      );
    }
    this.kitchenNodes = this.scene.rootNodes.filter(
      (node) => !before.has(node) && node instanceof TransformNode,
    ) as TransformNode[];
  }
  private art() {
    return {
      scene: this.scene,
      box: this.roundedBox.bind(this),
      sphere: this.sphere.bind(this),
      cylinder: this.cylinder.bind(this),
      tube: this.tube.bind(this),
      lathe: this.lathe.bind(this),
      leaf: this.leaf.bind(this),
    };
  }
  private buildGenericKitchen() {
    const before = new Set(this.scene.rootNodes);
    buildRestaurant(this.art(), this.restaurantId);
    this.buildStations();
    this.kitchenNodes = this.scene.rootNodes.filter(
      (n) => !before.has(n) && n instanceof TransformNode,
    ) as TransformNode[];
  }
  private buildStations() {
    const theme = restaurantArt(this.restaurantId);
    const palette = {
      ...basePalette,
      teal: theme.cabinet,
      dark: theme.wood,
      gold: theme.accent,
      pink: theme.secondary,
    };
    for (const def of this.layout) {
      const station = new TransformNode(def.id, this.scene);
      station.metadata = { station: def.id };
      station.position = this.world(def);
      const seat = def.kind === 'seat';
      const openTable = isOpenWorktable(def.kind);
      const noTop = seat || def.kind === 'trash';
      const cabinetColor = def.kind === 'trash' ? '#28544c' : palette.teal;
      if (def.kind === 'trash') {
        this.lathe(
          'tapered pedal bin shell',
          [
            new Vector3(0, -0.08),
            new Vector3(0.27, -0.08),
            new Vector3(0.35, 0.09),
            new Vector3(0.38, 0.74),
            new Vector3(0.34, 0.79),
            new Vector3(0, 0.79),
          ],
          cabinetColor,
          station,
          0,
          0.08,
          0,
        );
      } else if (seat) {
        this.roundedBox(
          'booth wooden plinth',
          0.88,
          0.36,
          0.78,
          0.07,
          '#79503f',
          station,
          0,
          0.18,
          0.08,
        );
      } else if (openTable) {
        for (const x of [-openTableSupport.offset, openTableSupport.offset])
          for (const z of [-openTableSupport.offset, openTableSupport.offset])
            this.roundedBox(
              'open table leg',
              0.085,
              openTableSupport.height,
              0.085,
              0.028,
              theme.wood,
              station,
              x,
              openTableSupport.centerY,
              z,
              0.72,
              0.04,
            );
        for (const z of [-0.39, 0.39])
          this.roundedBox(
            'open table cross rail',
            0.8,
            0.075,
            0.07,
            0.025,
            theme.wood,
            station,
            0,
            0.27,
            z,
          );
        for (const x of [-0.39, 0.39])
          this.roundedBox(
            'open table side rail',
            0.07,
            0.075,
            0.8,
            0.025,
            theme.wood,
            station,
            x,
            0.27,
            0,
          );
      } else {
        this.roundedBox(
          'rounded enamel cabinet',
          0.96,
          0.69,
          0.92,
          0.085,
          cabinetColor,
          station,
          0,
          0.4,
          0,
        );
        this.roundedBox('cabinet plinth', 0.84, 0.13, 0.78, 0.035, '#173c38', station, 0, 0.065, 0);
        this.roundedBox(
          'enameled inset panel',
          0.71,
          0.42,
          0.055,
          0.04,
          theme.wood,
          station,
          0,
          0.39,
          0.477,
        );
        this.roundedBox(
          'brass drawer pull',
          0.19,
          0.045,
          0.045,
          0.02,
          theme.accent,
          station,
          0,
          0.54,
          0.522,
          0.28,
          0.58,
        );
        for (const x of [-0.38, 0.38])
          this.sphere('cabinet fastener', 0.045, theme.accent, station, x, 0.67, 0.507);
      }
      if (!noTop) {
        this.roundedBox(
          'station accent edge',
          1.13,
          0.09,
          1.13,
          0.07,
          theme.accent,
          station,
          0,
          0.81,
          0,
          0.36,
          0.48,
        );
        this.roundedBox(
          'solid station worktop',
          1.08,
          0.12,
          1.08,
          0.07,
          def.kind === 'board' || def.kind === 'dispenser'
            ? '#f0d5a5'
            : def.kind === 'sink'
              ? '#c8d8d1'
              : '#fff4df',
          station,
          0,
          0.86,
          0,
          def.kind === 'sink' ? 0.38 : 0.78,
          def.kind === 'sink' ? 0.22 : 0.02,
        );
      }

      if (def.kind === 'dispenser') {
        this.roundedBox(
          'ingredient bin base',
          0.88,
          0.19,
          0.78,
          0.055,
          theme.wood,
          station,
          0,
          1.01,
          0,
        );
        this.roundedBox(
          'ingredient bin front',
          0.84,
          0.15,
          0.055,
          0.02,
          this.restaurantId === 'orbit' ? '#adb8c9' : '#ca8656',
          station,
          0,
          1.12,
          0.37,
        );
        for (const x of [-0.31, 0, 0.31])
          this.roundedBox('bin slat', 0.025, 0.14, 0.035, 0.01, '#f0ce93', station, x, 1.12, 0.406);
        const shown = this.food({ id: 'display', kind: def.ingredient!, parts: [] });
        shown.parent = station;
        shown.position.set(-0.2, 1.16, -0.03);
        shown.scaling.setAll(0.72);
        const shown2 = this.food({ id: 'display', kind: def.ingredient!, parts: [] });
        shown2.parent = station;
        shown2.position.set(0.22, 1.16, 0.05);
        shown2.rotation.y = 0.45;
        shown2.scaling.setAll(0.63);
      }
      if (def.kind === 'stove') {
        if (def.id === 'oven') {
          this.roundedBox(
            'enameled oven crown',
            0.9,
            0.1,
            0.84,
            0.06,
            '#e6e4d7',
            station,
            0,
            0.97,
            0,
            0.55,
            0.08,
          );
          this.roundedBox(
            'oven glass door surround',
            0.7,
            0.48,
            0.09,
            0.07,
            '#48585a',
            station,
            0,
            0.42,
            0.51,
            0.28,
            0.28,
          );
          this.roundedBox(
            'oven amber glass',
            0.51,
            0.28,
            0.025,
            0.045,
            '#d88959',
            station,
            0,
            0.44,
            0.565,
            0.34,
            0.12,
          );
          this.roundedBox(
            'oven pull handle',
            0.48,
            0.055,
            0.08,
            0.025,
            '#d8e1d9',
            station,
            0,
            0.71,
            0.59,
            0.28,
            0.55,
          );
          for (const x of [-0.27, 0, 0.27])
            this.cylinder(
              'oven temperature dial',
              0.11,
              0.05,
              theme.accent,
              station,
              x,
              0.76,
              0.57,
              0.32,
              0.48,
            ).rotation.x = Math.PI / 2;
          const ovenGlow = this.sphere(
            'oven completion glow',
            0.16,
            '#e5a161',
            station,
            0,
            1.035,
            0,
          );
          this.stationHeat.set(def.id, ovenGlow);
        } else {
          this.roundedBox(
            'cast iron hotplate',
            0.9,
            0.07,
            0.86,
            0.055,
            '#283b3b',
            station,
            0,
            0.97,
            0,
            0.42,
            0.3,
          );
          this.roundedBox(
            'front control fascia',
            0.76,
            0.2,
            0.08,
            0.045,
            '#234540',
            station,
            0,
            0.62,
            0.51,
          );
          for (const x of [-0.21, 0, 0.21]) {
            this.cylinder(
              'brass heat dial',
              0.13,
              0.065,
              '#edb65d',
              station,
              x,
              0.63,
              0.56,
            ).rotation.x = Math.PI / 2;
            this.sphere('dial marker', 0.025, '#fff3d8', station, x, 0.63, 0.598);
          }
          this.cylinder('cast burner', 0.58, 0.035, '#607273', station, 0, 1.015, 0, 0.36, 0.44);
          this.cylinder(
            'burner inner ring',
            0.4,
            0.045,
            '#303f40',
            station,
            0,
            1.047,
            0,
            0.38,
            0.35,
          );
          const burnerCore = this.cylinder(
            'warm burner core',
            0.2,
            0.04,
            '#db8453',
            station,
            0,
            1.073,
            0,
            0.54,
            0.12,
          );
          this.stationHeat.set(def.id, burnerCore);
          this.roundedBox(
            'grill crossbar A',
            0.72,
            0.045,
            0.07,
            0.02,
            '#3e5050',
            station,
            0,
            1.08,
            0,
            0.34,
            0.56,
          ).rotation.y = Math.PI / 4;
          this.roundedBox(
            'grill crossbar B',
            0.72,
            0.045,
            0.07,
            0.02,
            '#3e5050',
            station,
            0,
            1.08,
            0,
            0.34,
            0.56,
          ).rotation.y = -Math.PI / 4;
        }
      }
      if (def.kind === 'board') {
        if (def.id === 'mixer') {
          this.lathe(
            'wide ceramic mixing bowl',
            [
              new Vector3(0, 0.02),
              new Vector3(0.2, 0.02),
              new Vector3(0.33, 0.12),
              new Vector3(0.38, 0.27),
              new Vector3(0.36, 0.31),
              new Vector3(0.32, 0.26),
            ],
            '#e7d9bd',
            station,
            0,
            0.91,
            0,
            0.35,
            0.03,
          );
          this.tube(
            'mixing whisk handle',
            [new Vector3(0.16, 1.01, -0.12), new Vector3(0.27, 1.35, -0.2)],
            0.025,
            '#b9c8c2',
            station,
            0.54,
          );
          for (const offset of [-0.08, -0.03, 0.03, 0.08])
            this.tube(
              'mixing whisk wire',
              [
                new Vector3(0.27 + offset, 1.35, -0.2),
                new Vector3(0.21 + offset * 0.3, 1.08, -0.05),
                new Vector3(0.12 + offset * 0.35, 1.0, 0),
              ],
              0.009,
              '#afc0bb',
              station,
              0.62,
            );
        } else {
          this.roundedBox(
            'thick maple chopping board',
            0.82,
            0.08,
            0.69,
            0.075,
            '#d29a5e',
            station,
            0,
            0.97,
            0,
            0.9,
            0,
          );
          this.roundedBox(
            'butcher block end grain',
            0.65,
            0.014,
            0.5,
            0.05,
            '#e2b77b',
            station,
            0,
            1.016,
            0,
            0.94,
            0,
          );
          for (let mark = -1; mark <= 1; mark++)
            this.tube(
              'maple grain',
              [
                new Vector3(-0.22, 1.026, mark * 0.09),
                new Vector3(-0.06, 1.026, mark * 0.1 + 0.01),
                new Vector3(0.19, 1.026, mark * 0.09),
              ],
              0.006,
              '#bf8850',
              station,
            );
          this.roundedBox(
            'knife walnut grip',
            0.12,
            0.045,
            0.25,
            0.025,
            '#704638',
            station,
            0.31,
            1.07,
            0.05,
          ).rotation.y = -0.2;
          this.roundedBox(
            'knife satin blade',
            0.1,
            0.025,
            0.34,
            0.045,
            '#c3d6d0',
            station,
            0.28,
            1.07,
            -0.24,
            0.23,
            0.62,
          ).rotation.y = -0.2;
          this.sphere('knife bolster', 0.08, '#edc476', station, 0.31, 1.07, -0.075);
        }
      }
      if (def.kind === 'sink') {
        this.roundedBox(
          'sink cast rim',
          0.89,
          0.08,
          0.82,
          0.1,
          '#adc2b9',
          station,
          0,
          0.98,
          0,
          0.34,
          0.2,
        );
        this.roundedBox(
          'deep porcelain basin',
          0.69,
          0.07,
          0.61,
          0.11,
          '#496f73',
          station,
          0,
          0.999,
          0,
          0.24,
          0.25,
        );
        this.roundedBox(
          'clear water surface',
          0.5,
          0.012,
          0.43,
          0.09,
          '#82c6c3',
          station,
          0,
          1.04,
          0,
          0.3,
          0.06,
        );
        for (let ring = 0; ring < 3; ring++)
          this.tube(
            'water ripple',
            Array.from({ length: 17 }, (_, i) => {
              const angle = (i / 16) * Math.PI * 2;
              return new Vector3(
                Math.cos(angle) * (0.09 + ring * 0.055),
                1.052,
                Math.sin(angle) * (0.09 + ring * 0.055),
              );
            }),
            0.008,
            ring === 1 ? '#ddf4df' : '#65aaa8',
            station,
          );
        this.tube(
          'arched chrome faucet',
          [
            new Vector3(-0.26, 0.99, -0.31),
            new Vector3(-0.26, 1.17, -0.31),
            new Vector3(-0.26, 1.3, -0.24),
            new Vector3(-0.26, 1.3, -0.02),
            new Vector3(-0.26, 1.16, 0.06),
          ],
          0.035,
          '#bdcbc2',
          station,
          0.72,
        );
        for (const x of [-0.34, 0.34]) {
          this.cylinder(
            'tap handle base',
            0.12,
            0.04,
            '#e3b767',
            station,
            x,
            1.07,
            -0.29,
            0.38,
            0.45,
          );
          this.roundedBox(
            'tap wing',
            0.24,
            0.045,
            0.06,
            0.02,
            '#d7e2d8',
            station,
            x,
            1.11,
            -0.29,
            0.28,
            0.55,
          );
        }
      }
      if (def.kind === 'trash') {
        this.cylinder(
          'waste opening rolled rim',
          0.61,
          0.055,
          '#d8b978',
          station,
          0,
          0.92,
          0,
          0.48,
          0.2,
        );
        this.cylinder('waste opening', 0.39, 0.03, '#244541', station, 0, 0.955, 0, 0.9, 0.02);
        this.roundedBox(
          'hinged bin flap',
          0.27,
          0.035,
          0.22,
          0.04,
          theme.accent,
          station,
          0.27,
          0.97,
          -0.12,
        ).rotation.x = -0.18;
        this.roundedBox(
          'foot pedal',
          0.28,
          0.055,
          0.1,
          0.025,
          '#bccbc1',
          station,
          0,
          0.2,
          0.53,
          0.36,
          0.48,
        );
      }
      if (def.kind === 'rack') {
        this.roundedBox(
          'plate shelf',
          0.82,
          0.08,
          0.16,
          0.04,
          '#b4c8bf',
          station,
          0,
          1.0,
          -0.32,
          0.38,
          0.26,
        );
        for (const x of [-0.29, 0, 0.29])
          this.roundedBox(
            'plate rail',
            0.035,
            0.28,
            0.04,
            0.015,
            '#c1d0c7',
            station,
            x,
            1.13,
            -0.34,
            0.32,
            0.32,
          );
      }
      if (def.kind === 'assembly') {
        this.roundedBox('coral pass mat', 0.85, 0.025, 0.72, 0.08, '#d97b67', station, 0, 0.94, 0);
        this.roundedBox('cream inlay', 0.68, 0.012, 0.54, 0.06, '#f8e7c7', station, 0, 0.96, 0);
        this.lathe(
          'counter service bell',
          [
            new Vector3(0, 0.02),
            new Vector3(0.12, 0.02),
            new Vector3(0.2, 0.08),
            new Vector3(0.2, 0.16),
            new Vector3(0.13, 0.26),
            new Vector3(0, 0.28),
          ],
          '#dba95c',
          station,
          0.35,
          0.99,
          -0.31,
          0.22,
          0.72,
        );
        this.sphere('bell button', 0.07, '#fff0ce', station, 0.35, 1.31, -0.31);
      }
      if (def.kind === 'counter') {
        this.roundedBox(
          'pickup shelf',
          0.76,
          0.055,
          0.44,
          0.05,
          '#f0d29b',
          station,
          0,
          0.96,
          -0.18,
        );
        this.roundedBox(
          'order ticket rail',
          0.64,
          0.11,
          0.075,
          0.035,
          '#df8868',
          station,
          0,
          1.03,
          -0.42,
        );
        this.roundedBox(
          'paper order ticket',
          0.31,
          0.38,
          0.035,
          0.04,
          '#fff7e5',
          station,
          0,
          1.25,
          -0.43,
          0.9,
          0,
        );
        for (let line = 0; line < 3; line++)
          this.roundedBox(
            'ticket ink',
            0.18 + (line % 2) * 0.035,
            0.018,
            0.014,
            0.006,
            '#bb8157',
            station,
            -0.02,
            1.33 - line * 0.07,
            -0.402,
            0.92,
            0,
          );
      }
      if (seat) {
        this.roundedBox(
          'diner booth back',
          0.82,
          0.84,
          0.16,
          0.12,
          '#cc705c',
          station,
          0,
          1.38,
          -0.33,
        );
        this.roundedBox(
          'booth welt',
          0.84,
          0.055,
          0.18,
          0.025,
          '#f2bd74',
          station,
          0,
          1.66,
          -0.31,
          0.72,
          0.04,
        );
        this.roundedBox(
          'booth seat cushion',
          0.86,
          0.18,
          0.82,
          0.14,
          '#df8669',
          station,
          0,
          0.56,
          0.08,
        );
      }
      dressStation(this.art(), station, def, this.restaurantId);
      station.metadata = { station: def.id };
    }

    // Seats stay at their server-authored grid positions, while their furniture
    // reads as one shared two-place dining run instead of two isolated tables.
    const seats = this.layout
      .filter((station) => station.kind === 'seat')
      .slice()
      .sort((a, b) => a.z - b.z);
    if (seats.length) {
      const first = seats[0]!;
      const last = seats.at(-1)!;
      const center = new TransformNode('shared dining run · visual only', this.scene);
      center.position.copyFrom(
        this.world({ x: (first.x + last.x) / 2, z: (first.z + last.z) / 2 }),
      );
      const runLength = Math.max(1.45, last.z - first.z + 1.15);
      this.roundedBox(
        'continuous dining table apron',
        1.16,
        0.17,
        runLength + 0.08,
        0.08,
        theme.wood,
        center,
        0,
        0.91,
        0,
        0.82,
        0.02,
      );
      this.roundedBox(
        'continuous dining tabletop',
        1.26,
        0.13,
        runLength,
        0.09,
        this.restaurantId === 'little-sun' ? '#f3d9a8' : theme.accent,
        center,
        0,
        1.05,
        0,
        0.78,
        0.03,
      );
      for (const seat of seats) {
        const placeZ = seat.z - (first.z + last.z) / 2;
        this.roundedBox(
          'woven place mat',
          0.68,
          0.025,
          0.72,
          0.065,
          theme.cabinet,
          center,
          0.22,
          1.128,
          placeZ,
          0.94,
        );
        this.roundedBox(
          'folded linen napkin',
          0.24,
          0.026,
          0.27,
          0.045,
          this.restaurantId === 'little-sun' ? theme.accent : '#fff2d7',
          center,
          0.22,
          1.154,
          placeZ - 0.12,
          0.93,
        );
        this.roundedBox(
          'napkin stitched edge',
          0.19,
          0.009,
          0.018,
          0.008,
          theme.accent,
          center,
          0.22,
          1.171,
          placeZ - 0.12,
          0.72,
          0.03,
        );
      }
      for (const z of [-1, 1]) {
        this.roundedBox(
          'dining table pedestal foot',
          0.82,
          0.1,
          0.16,
          0.045,
          theme.wood,
          center,
          0,
          0.05,
          (runLength / 2 - 0.24) * z,
        );
        this.roundedBox(
          'dining table pedestal',
          0.19,
          0.8,
          0.19,
          0.065,
          theme.wood,
          center,
          0,
          0.5,
          (runLength / 2 - 0.24) * z,
        );
      }
    }
    stationContacts(this.scene, this.layout, true);
  }
  private person(id: string, color: string, chef = false): CharacterRig {
    const appearance = chef
      ? { variant: 0, hair: '#825039', blinkOffset: 0 }
      : customerAppearance(id);
    const root = new TransformNode(id, this.scene);
    // A small unlit contact ellipse grounds the feet even in Low Graphics mode.
    let contactMaterial = this.textureMaterials.get('character-contact');
    if (!contactMaterial) {
      contactMaterial = new PBRMaterial('character-contact', this.scene);
      contactMaterial.albedoColor = Color3.FromHexString('#443e32');
      contactMaterial.unlit = true;
      contactMaterial.alpha = 0.16;
      this.textureMaterials.set('character-contact', contactMaterial);
    }
    const contact = MeshBuilder.CreateDisc(
      'foot contact shadow',
      { radius: 0.37, tessellation: 24 },
      this.scene,
    );
    contact.parent = root;
    contact.rotation.x = Math.PI / 2;
    contact.position.y = 0.012;
    contact.scaling.y = 0.78;
    contact.material = contactMaterial;
    contact.isPickable = false;
    const torso = new TransformNode(`${id}-torso`, this.scene);
    torso.parent = root;
    torso.position.y = 0.65;
    const coat = this.capsule('body', 0.76, 0.35, color, torso, 0, 0, 0);
    coat.scaling.set(1.1, 1.0, 0.94);
    for (const x of [-0.24, 0.24]) {
      const shoulder = this.sphere('rounded jacket shoulder', 0.35, color, torso, x, 0.24, 0);
      shoulder.scaling.set(1, 0.87, 0.84);
    }
    if (chef) {
      this.roundedBox(
        'apron waist panel',
        0.55,
        0.45,
        0.075,
        0.07,
        '#fff1d5',
        torso,
        0,
        -0.06,
        0.27,
        0.96,
        0,
      );
      this.roundedBox(
        'apron bib',
        0.39,
        0.31,
        0.07,
        0.065,
        '#fff3dc',
        torso,
        0,
        0.28,
        0.245,
        0.96,
        0,
      );
      this.roundedBox(
        'apron pocket',
        0.22,
        0.14,
        0.035,
        0.035,
        '#e6b86f',
        torso,
        0,
        -0.08,
        0.32,
        0.92,
        0,
      );
      this.roundedBox(
        'apron pocket stitch',
        0.15,
        0.012,
        0.016,
        0.006,
        '#fff2d5',
        torso,
        0,
        -0.035,
        0.343,
        0.95,
        0,
      );
      for (const x of [-0.15, 0.15])
        this.tube(
          'apron neck strap',
          [
            new Vector3(x, 0.17, 0.25),
            new Vector3(x * 0.72, 0.4, 0.14),
            new Vector3(x * 0.5, 0.42, 0.02),
          ],
          0.035,
          '#f6d396',
          torso,
        );
      for (let seam = -1; seam <= 1; seam++)
        this.tube(
          'jacket piping',
          [new Vector3(seam * 0.11, 0.27, 0.267), new Vector3(seam * 0.11, -0.23, 0.292)],
          0.008,
          '#b8d3c3',
          torso,
        );
      this.sphere('jacket button', 0.055, '#f2cb7b', torso, -0.06, 0.11, 0.29);
      this.sphere('jacket button', 0.055, '#f2cb7b', torso, -0.06, -0.02, 0.29);
    } else {
      this.roundedBox('shirt collar', 0.25, 0.1, 0.07, 0.025, '#f8e6cb', torso, 0, 0.31, 0.26);
      this.tube(
        'shirt seam',
        [new Vector3(0, 0.25, 0.28), new Vector3(0, -0.2, 0.28)],
        0.012,
        '#d3b89c',
        torso,
      );
    }
    const head = new TransformNode(`${id}-head`, this.scene);
    head.parent = root;
    head.position.set(0, 1.3, 0.015);
    head.rotation.x = -0.22;
    if (!chef)
      head.scaling.set(
        [1, 1.05, 0.96, 1.08][appearance.variant],
        [1, 0.96, 1.04, 0.94][appearance.variant],
        1,
      );
    const hair = this.sphere('hair silhouette', 0.91, appearance.hair, head, 0, 0.045, -0.045);
    hair.scaling.set(1, 1.02, 0.86);
    const face = this.sphere('soft round face', 0.88, '#eab68d', head, 0, 0, 0.035);
    face.scaling.set(1.08, 0.96, 0.95);
    for (const side of [-1, 1]) {
      this.sphere('rounded ear', 0.2, '#eab68d', head, side * 0.45, -0.04, 0.015).scaling.set(
        0.65,
        1,
        0.75,
      );
      this.sphere(
        'ear inner warmth',
        0.075,
        '#d99571',
        head,
        side * 0.48,
        -0.035,
        0.055,
      ).scaling.set(0.5, 1, 0.45);
      this.sphere('warm cheek', 0.16, '#edae98', head, side * 0.245, -0.13, 0.335).scaling.z = 0.25;
    }
    this.sphere('button nose', 0.115, '#d99571', head, 0, -0.035, 0.426);
    if (chef) {
      this.sphere('hat hairline curl', 0.16, '#825039', head, -0.31, 0.28, -0.02);
      this.cylinder('toque gold piping', 0.62, 0.08, '#e5b45d', head, 0, 0.51, 0, 0.52, 0.03);
      this.lathe(
        'sculpted puff chef toque',
        [
          new Vector3(0, 0),
          new Vector3(0.22, 0.03),
          new Vector3(0.28, 0.11),
          new Vector3(0.27, 0.2),
          new Vector3(0.34, 0.31),
          new Vector3(0.34, 0.46),
          new Vector3(0.25, 0.57),
          new Vector3(0.14, 0.59),
          new Vector3(0, 0.55),
        ],
        '#fffaf0',
        head,
        0,
        0.59,
        -0.02,
        0.93,
      );
      for (const x of [-0.16, 0.16]) {
        const puff = this.sphere('toque folded crown', 0.37, '#fffaf0', head, x, 0.82, -0.01);
        puff.scaling.set(0.94, 1.08, 0.9);
      }
      const centerPuff = this.sphere('toque crown center', 0.42, '#fffaf0', head, 0, 0.88, -0.025);
      centerPuff.scaling.set(1.1, 1.0, 0.95);
      centerPuff.position.x = 0.055;
      for (const x of [-0.235, 0.235])
        this.tube(
          'toque pleat',
          [
            new Vector3(x, 0.59, 0.11),
            new Vector3(x * 0.9, 0.73, 0.19),
            new Vector3(x * 0.65, 0.88, 0.15),
          ],
          0.012,
          '#e9e5d8',
          head,
        );
    } else if (appearance.variant === 0) {
      this.sphere('curly fringe', 0.25, appearance.hair, head, 0.18, 0.27, 0.25);
      this.sphere('side curl', 0.26, appearance.hair, head, -0.33, -0.04, 0.02);
    } else if (appearance.variant === 1) {
      const fringe = this.capsule(
        'side-swept fringe',
        0.48,
        0.17,
        appearance.hair,
        head,
        0.08,
        0.28,
        0.23,
      );
      fringe.rotation.z = -0.28;
      this.sphere('soft temple curl', 0.24, appearance.hair, head, -0.32, -0.02, 0.14);
    } else if (appearance.variant === 2) {
      const fringe = this.capsule(
        'swept-up fringe',
        0.42,
        0.16,
        appearance.hair,
        head,
        -0.08,
        0.29,
        0.21,
      );
      fringe.rotation.z = 0.24;
      this.sphere('low ponytail', 0.29, appearance.hair, head, 0.16, 0.01, -0.31);
      this.cylinder('warm hair tie', 0.16, 0.055, '#e5b45d', head, 0.16, 0.02, -0.33);
    } else {
      this.sphere('rounded top knot', 0.31, appearance.hair, head, -0.08, 0.34, -0.02);
      const band = this.tube(
        'soft fabric hairband',
        Array.from(
          { length: 17 },
          (_, i) =>
            new Vector3(
              Math.cos((i * Math.PI) / 16) * 0.34,
              0.2 + Math.sin((i * Math.PI) / 16) * 0.16,
              0.255,
            ),
        ),
        0.024,
        '#e7b865',
        head,
      );
      band.isPickable = false;
    }

    const leftArm = new TransformNode(`${id}-left-arm`, this.scene);
    const rightArm = new TransformNode(`${id}-right-arm`, this.scene);
    leftArm.parent = rightArm.parent = torso;
    leftArm.position.set(-0.34, 0.17, 0.015);
    rightArm.position.set(0.34, 0.17, 0.015);
    for (const [name, arm] of [
      ['left', leftArm],
      ['right', rightArm],
    ] as const) {
      const sleeve = this.capsule(`${name} puff sleeve`, 0.43, 0.15, color, arm, 0, -0.15, 0.01);
      sleeve.rotation.z = name === 'left' ? -0.13 : 0.13;
      this.cylinder(`${name} cuff`, 0.27, 0.07, '#fff1d5', arm, 0, -0.32, 0.045, 0.86, 0);
      const hand = this.sphere(`${name} hand`, 0.24, '#eab68d', arm, 0, -0.43, 0.08);
      hand.scaling.set(0.93, 0.95, 0.83);
      this.sphere(
        `${name} thumb`,
        0.085,
        '#eab68d',
        arm,
        name === 'left' ? 0.07 : -0.07,
        -0.41,
        0.145,
      );
    }
    const leftLeg = new TransformNode(`${id}-left-leg`, this.scene);
    const rightLeg = new TransformNode(`${id}-right-leg`, this.scene);
    leftLeg.parent = rightLeg.parent = root;
    leftLeg.position.set(-0.16, 0.36, 0);
    rightLeg.position.set(0.16, 0.36, 0);
    for (const [name, leg] of [
      ['left', leftLeg],
      ['right', rightLeg],
    ] as const) {
      this.capsule(`${name} trouser leg`, 0.43, 0.115, '#456158', leg, 0, -0.09, 0);
      const shoe = this.sphere(`${name} rounded work shoe`, 0.34, '#403e39', leg, 0, -0.25, 0.07);
      shoe.scaling.set(0.95, 0.62, 1.22);
      this.roundedBox(
        `${name} shoe welt`,
        0.2,
        0.025,
        0.21,
        0.01,
        '#d4a565',
        leg,
        0,
        -0.3475,
        0.09,
        0.62,
        0,
      );
    }
    const slots = {
      hat: new TransformNode(`${id}-hat-slot`, this.scene),
      hair: new TransformNode(`${id}-hair-slot`, this.scene),
      apron: new TransformNode(`${id}-apron-slot`, this.scene),
    };
    const rig = {
      root,
      contact,
      torso,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      face: this.createCharacterFace(head),
      faceKey: '',
      blinkOffset: appearance.blinkOffset,
      slots,
    };
    slots.hat.parent = slots.hair.parent = head;
    slots.apron.parent = torso;
    for (const mesh of head.getChildMeshes(true)) {
      if (/toque/.test(mesh.name)) mesh.parent = slots.hat;
      else if (/hair|fringe|curl|ponytail|top knot/.test(mesh.name)) mesh.parent = slots.hair;
    }
    for (const mesh of torso.getChildMeshes(true))
      if (mesh.name.startsWith('apron')) mesh.parent = slots.apron;
    root.metadata = {
      artVersion: characterArtContract.version,
      slots: Object.fromEntries(Object.entries(slots).map(([slot, node]) => [slot, node.name])),
      heldAnchor: characterArtContract.heldAnchor,
    };
    for (const part of [torso, head, leftArm, rightArm, leftLeg, rightLeg, ...Object.values(slots)])
      this.batchStatic(part, true);
    this.rigs.set(id, rig);
    return rig;
  }
  private food(item: Item) {
    const p = new TransformNode(item.id, this.scene);
    p.metadata = { visualFood: true };
    const recipe = dishRecipe(item.kind);
    const needsPlate = ['plate', 'dirtyPlate'].includes(item.kind) || !!recipe;
    if (needsPlate) {
      const ware = item.kind === 'dirtyPlate' ? '#b6a38a' : '#fffaf0';
      this.lathe(
        'hand-thrown ceramic plate',
        [
          new Vector3(0, 0.012),
          new Vector3(0.22, 0.012),
          new Vector3(0.35, 0.024),
          new Vector3(0.42, 0.055),
          new Vector3(0.45, 0.1),
          new Vector3(0.43, 0.12),
          new Vector3(0.39, 0.105),
          new Vector3(0.35, 0.068),
          new Vector3(0.26, 0.052),
          new Vector3(0, 0.052),
        ],
        ware,
        p,
        0,
        0,
        0,
        0.32,
      );
      this.tube(
        'plate fine gold rim',
        Array.from({ length: 33 }, (_, i) => {
          const a = (i / 32) * Math.PI * 2;
          return new Vector3(Math.cos(a) * 0.414, 0.085, Math.sin(a) * 0.414);
        }),
        0.009,
        '#d8ad64',
        p,
        0.46,
      );
      if (item.kind === 'dirtyPlate') {
        for (let crumb = 0; crumb < 5; crumb++) {
          const angle = crumb * 2.4;
          this.sphere(
            'toasted crumbs',
            0.055 + (crumb % 2) * 0.025,
            crumb % 2 ? '#9c6844' : '#bf8754',
            p,
            Math.cos(angle) * (0.09 + (crumb % 2) * 0.07),
            0.073,
            Math.sin(angle) * 0.11,
          );
        }
        this.sphere('sauce smear', 0.1, '#d69b65', p, 0.15, 0.069, -0.1).scaling.set(
          1.45,
          0.08,
          0.62,
        );
      }
    }

    const leaf = (name: string, x: number, y: number, z: number, angle: number, scale: number) => {
      this.leaf(name, scale % 2 ? '#71a850' : '#85b85c', p, x, y, z, angle, scale);
    };
    const bun = (name: string, y: number, scale = 1) => {
      const shell = this.sphere(name, 0.52 * scale, '#e7ad58', p, 0, y, 0);
      shell.scaling.set(1, 0.62, 0.91);
      this.sphere(
        'baked lower crust',
        0.48 * scale,
        '#b76c3e',
        p,
        0,
        y - 0.105 * scale,
        0,
      ).scaling.set(1, 0.17, 0.9);
      for (let seed = 0; seed < 3; seed++) {
        const angle = seed * 2.399,
          radius = (0.08 + (seed % 3) * 0.065) * scale,
          x = Math.cos(angle) * radius,
          z = Math.sin(angle) * radius * 0.9;
        const bump = this.sphere(
          'toasted sesame seed',
          0.045 * scale,
          '#fff0cd',
          p,
          x,
          y + 0.1 * scale,
          z,
        );
        bump.scaling.set(1.2, 0.42, 0.72);
        bump.rotation.y = angle;
      }
      for (let score = -1; score <= 1; score++)
        this.tube(
          'bun scoring',
          [
            new Vector3(score * 0.11 * scale, y + 0.142 * scale, -0.07 * scale),
            new Vector3(score * 0.1 * scale, y + 0.155 * scale, 0),
            new Vector3(score * 0.11 * scale, y + 0.142 * scale, 0.07 * scale),
          ],
          0.007 * scale,
          '#d69a51',
          p,
        );
    };
    const patty = (burnt = false, y = 0.24, scale = 1) => {
      const crust = burnt ? '#3b2c28' : '#75402d';
      const center = burnt ? '#322824' : '#9b5738';
      this.cylinder('crisp patty edge', 0.54 * scale, 0.13 * scale, crust, p, 0, y, 0, 0.58);
      this.cylinder(
        'caramelized meat face',
        0.48 * scale,
        0.07 * scale,
        center,
        p,
        0,
        y + 0.05 * scale,
        0,
        burnt ? 0.85 : 0.62,
      );
      if (!burnt)
        for (let mark = -1; mark <= 1; mark++)
          this.roundedBox(
            'char-grill sear',
            0.42 * scale,
            0.012 * scale,
            0.022 * scale,
            0.008 * scale,
            '#d58a54',
            p,
            0,
            y + 0.09 * scale,
            mark * 0.105 * scale,
            0.78,
          ).rotation.y = Math.PI / 5;
    };

    if (
      item.kind === 'burger' ||
      item.kind === 'deluxe-burger' ||
      item.kind === 'cheeseburger' ||
      item.kind === 'chicken-burger'
    ) {
      this.cylinder('bottom brioche', 0.5, 0.1, '#d99b54', p, 0, 0.12, 0);
      if (item.kind === 'chicken-burger') {
        this.roundedBox(
          'crispy chicken fillet',
          0.48,
          0.14,
          0.4,
          0.055,
          '#bd7040',
          p,
          0,
          0.245,
          0,
          0.8,
        );
        for (let crumb = 0; crumb < 6; crumb++)
          this.sphere(
            'crunchy chicken crumb',
            0.055,
            '#e0a35c',
            p,
            Math.sin(crumb * 2.4) * 0.19,
            0.32,
            Math.cos(crumb * 2.4) * 0.16,
          ).scaling.set(1.2, 0.5, 0.8);
      } else patty(false, 0.245, 0.86);
      if (item.kind === 'cheeseburger')
        this.roundedBox(
          'melted cheddar layer',
          0.57,
          0.065,
          0.54,
          0.035,
          '#f3c548',
          p,
          0,
          0.315,
          0,
          0.85,
        );
      if (item.kind === 'cheeseburger')
        for (const side of [-1, 1]) {
          const drip = this.roundedBox(
            'cheddar folded corner',
            0.13,
            0.11,
            0.09,
            0.035,
            '#f3c548',
            p,
            side * 0.23,
            0.275,
            0.19,
            0.85,
          );
          drip.rotation.z = side * 0.3;
        }
      for (let leafIndex = 0; leafIndex < 5; leafIndex++) {
        const angle = (leafIndex / 5) * Math.PI * 2;
        leaf(
          'crinkled butter lettuce frill',
          Math.cos(angle) * 0.18,
          0.315,
          Math.sin(angle) * 0.18,
          angle,
          0.64,
        );
      }
      this.cylinder('burger relish', 0.34, 0.027, '#7da84c', p, 0, 0.31, 0, 0.83);
      if (item.kind === 'deluxe-burger') {
        this.roundedBox('toasted bread crown', 0.5, 0.11, 0.48, 0.1, '#d99b54', p, 0, 0.42, 0, 0.8);
        for (let stripe = -1; stripe <= 1; stripe++)
          this.roundedBox(
            'bread toast stripe',
            0.43,
            0.018,
            0.028,
            0.012,
            '#9d5738',
            p,
            0,
            0.486,
            stripe * 0.13,
            0.8,
          );
      } else bun('top brioche dome', 0.46, 0.95);
    } else if (item.kind === 'burger-bun') {
      bun('brioche bun', 0.11);
    } else if (item.kind === 'bun' || item.kind === 'bun-prepared' || item.kind === 'toast') {
      if (item.kind !== 'toast') bun('single brioche bun', 0.12, 0.92);
      else {
        const slice = this.roundedBox(
          'thick-cut toast',
          0.58,
          0.13,
          0.46,
          0.12,
          '#d28b43',
          p,
          0,
          0.09,
          0,
          0.82,
        );
        slice.rotation.y = 0.08;
        this.roundedBox(
          'golden toast center',
          0.46,
          0.035,
          0.34,
          0.09,
          '#efc77a',
          p,
          0,
          0.15,
          0,
          0.92,
        );
        for (const x of [-0.14, 0, 0.14])
          this.roundedBox(
            'toast grill line',
            0.025,
            0.012,
            0.25,
            0.01,
            '#b56d3c',
            p,
            x,
            0.171,
            0,
            0.86,
          );
      }
    } else if (item.kind === 'lettuce' || item.kind === 'choppedLettuce') {
      const count = item.kind === 'lettuce' ? 5 : 7;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2,
          radius = item.kind === 'lettuce' ? 0.1 : 0.13,
          size = item.kind === 'lettuce' ? 1.06 : 0.67;
        leaf(
          item.kind === 'lettuce' ? 'fresh romaine leaf' : 'chopped lettuce piece',
          Math.cos(angle) * radius,
          item.kind === 'lettuce' ? 0.12 : 0.09 + (i % 3) * 0.025,
          Math.sin(angle) * radius,
          angle,
          size,
        );
      }
      if (item.kind === 'lettuce')
        this.sphere('lettuce heart', 0.24, '#b2cc68', p, 0, 0.15, 0).scaling.set(1, 0.72, 0.86);
    } else if (item.kind === 'meat' || item.kind === 'cookedMeat') {
      if (item.kind === 'meat') {
        const raw = this.capsule('fresh butcher cut', 0.46, 0.19, '#ce6755', p, 0, 0.105, 0);
        raw.rotation.z = Math.PI / 2;
        raw.scaling.set(1.2, 0.62, 1.04);
        for (const fatline of [-0.1, 0.1])
          this.tube(
            'marbled fat',
            [
              new Vector3(-0.15, 0.17, fatline),
              new Vector3(-0.04, 0.19, fatline * 0.4),
              new Vector3(0.14, 0.15, fatline),
            ],
            0.015,
            '#f5caa2',
            p,
          );
      } else patty(false, 0.08, 0.86);
    } else if (item.kind === 'burnt') {
      patty(true, 0.1, 0.86);
      for (let crack = 0; crack < 4; crack++) {
        const angle = (crack / 4) * Math.PI * 2;
        this.tube(
          'charred crack',
          [
            new Vector3(0, 0.155, 0),
            new Vector3(Math.cos(angle) * 0.12, 0.157, Math.sin(angle) * 0.12),
          ],
          0.013,
          '#191b18',
          p,
        );
      }
    } else if (recipe?.id === 'sunshine-fries') {
      for (let fry = 0; fry < 9; fry++) {
        const stick = this.roundedBox(
          'golden hand-cut french fry',
          0.09,
          0.29,
          0.085,
          0.025,
          fry % 3 ? '#edbd54' : '#f5d475',
          p,
          ((fry % 3) - 1) * 0.12,
          0.2 + (fry % 2) * 0.06,
          (Math.floor(fry / 3) - 1) * 0.1,
          0.04,
        );
        stick.rotation.z = (fry % 2 ? 1 : -1) * 0.08;
      }
    } else if (recipe?.id.startsWith('tide-')) {
      const roll = recipe.id === 'tide-signature-b' || recipe.id === 'tide-signature-c';
      if (roll) {
        for (let piece = 0; piece < 4; piece++) {
          const x = (piece - 1.5) * 0.17;
          this.cylinder('nori maki roll', 0.16, 0.16, '#324b3e', p, x, 0.16, 0.01, 0.55);
          this.cylinder('rice ring', 0.12, 0.17, '#fff2d8', p, x, 0.16, 0.012, 0.5);
          this.sphere(
            'salmon or roe center',
            0.075,
            piece % 2 ? '#ec8b6f' : '#e7b65f',
            p,
            x,
            0.25,
            0.018,
          ).scaling.set(1, 0.8, 0.8);
        }
      } else {
        for (const x of [-0.2, 0, 0.2]) {
          this.sphere('hand-pressed sushi rice', 0.16, '#fff2d8', p, x, 0.13, 0).scaling.set(
            1.25,
            0.48,
            0.75,
          );
          this.roundedBox(
            'salmon nigiri topping',
            0.25,
            0.075,
            0.24,
            0.05,
            recipe.id === 'tide-signature-a' && x === 0 ? '#d47a5f' : '#ed9471',
            p,
            x,
            0.22,
            0,
            0.8,
          );
          this.tube(
            'salmon marbling',
            [new Vector3(x - 0.07, 0.263, -0.06), new Vector3(x + 0.06, 0.263, 0.05)],
            0.012,
            '#ffe0b2',
            p,
          );
        }
      }
      if (recipe.id === 'tide-premium' || recipe.id === 'tide-signature-c')
        this.cylinder('toasted sesame garnish', 0.055, 0.03, '#eac577', p, 0, 0.24, 0.22);
    } else if (recipe?.id.startsWith('olive-')) {
      for (let strand = 0; strand < 8; strand++) {
        const angle = (strand * Math.PI) / 4;
        this.tube(
          'silky pasta nest',
          Array.from({ length: 12 }, (_, i) => {
            const t = i / 11;
            return new Vector3(
              Math.cos(angle + t * 5) * (0.07 + t * 0.15),
              0.12 + t * 0.09,
              Math.sin(angle + t * 5) * (0.07 + t * 0.15),
            );
          }),
          0.022,
          strand % 2 ? '#e8c26e' : '#f4d989',
          p,
        );
      }
      for (let tomato = 0; tomato < 5; tomato++)
        this.sphere(
          'roasted tomato',
          0.095,
          tomato % 2 ? '#d86443' : '#e88950',
          p,
          Math.sin(tomato * 1.25) * 0.22,
          0.2,
          Math.cos(tomato * 1.25) * 0.17,
        ).scaling.set(1, 0.75, 1);
      if (recipe.id === 'olive-premium' || recipe.id === 'olive-signature-c')
        for (let leaflet = 0; leaflet < 4; leaflet++)
          leaf(
            'fresh basil garnish',
            Math.sin(leaflet * 1.6) * 0.15,
            0.29,
            Math.cos(leaflet * 1.6) * 0.14,
            leaflet,
            0.48,
          );
    } else if (recipe?.id.startsWith('lantern-')) {
      if (recipe.id === 'lantern-signature-c') {
        for (let dumpling = 0; dumpling < 5; dumpling++) {
          const x = (dumpling - 2) * 0.13;
          this.sphere(
            'steamed dumpling body',
            0.13,
            '#f2d9a4',
            p,
            x,
            0.15,
            Math.sin(dumpling) * 0.1,
          ).scaling.set(1.2, 0.7, 0.9);
          this.tube(
            'dumpling pleat',
            [
              new Vector3(x - 0.08, 0.21, 0),
              new Vector3(x, 0.26, 0.025),
              new Vector3(x + 0.08, 0.21, 0),
            ],
            0.012,
            '#c08a54',
            p,
          );
        }
      } else {
        for (let noodle = 0; noodle < 7; noodle++)
          this.tube(
            'wok-tossed noodle ribbon',
            Array.from(
              { length: 10 },
              (_, i) =>
                new Vector3(
                  -0.22 + i * 0.048,
                  0.13 + Math.sin(i * 0.85 + noodle) * 0.055,
                  Math.sin(i * 0.55 + noodle * 1.7) * 0.16,
                ),
            ),
            0.017,
            noodle % 2 ? '#e8bd67' : '#f2d88e',
            p,
          );
        for (let garnish = 0; garnish < 5; garnish++)
          this.roundedBox(
            'wok vegetable or tofu',
            0.12,
            0.095,
            0.11,
            0.02,
            garnish % 2 ? '#d78a4e' : '#8da85a',
            p,
            Math.sin(garnish * 1.4) * 0.19,
            0.24,
            Math.cos(garnish * 1.4) * 0.16,
          );
      }
    } else if (recipe?.id.startsWith('orbit-')) {
      this.cylinder('orbital sauce pool', 0.39, 0.045, '#7d668f', p, 0, 0.09, 0, 0.9);
      recipe.components.forEach((kind, index) => {
        const component = this.food({ id: `orbit-plating-${index}`, kind, parts: [] });
        component.parent = p;
        const angle = (index * Math.PI * 2) / recipe.components.length;
        component.position.set(Math.cos(angle) * 0.2, 0.11, Math.sin(angle) * 0.17);
        component.scaling.setAll(0.68);
      });
    } else if (recipe && item.kind !== 'burger' && item.kind !== 'deluxe-burger') {
      const palette = item.parts.length ? item.parts : recipe.components;
      palette.forEach((kind, index) => {
        const piece = this.food({ id: 'plated-component', kind, parts: [] });
        piece.parent = p;
        const angle = (index / Math.max(1, palette.length)) * Math.PI * 2;
        piece.position.set(Math.cos(angle) * 0.16, 0.11 + index * 0.055, Math.sin(angle) * 0.16);
        piece.scaling.setAll(0.85);
      });
    } else if (item.kind === 'cheese' || item.kind === 'slicedCheese') {
      this.roundedBox(
        'cheddar slice',
        0.42,
        item.kind === 'cheese' ? 0.12 : 0.04,
        0.38,
        0.035,
        item.kind === 'cheese' ? '#e6b537' : '#f3cc50',
        p,
        0,
        0.11,
        0,
        0.35,
      );
      if (item.kind === 'slicedCheese')
        this.sphere('cheese shine', 0.045, '#fff0a0', p, -0.11, 0.15, -0.07).scaling.set(
          1.7,
          0.2,
          0.6,
        );
    } else if (item.kind === 'chicken' || item.kind === 'friedChicken') {
      const cooked = item.kind === 'friedChicken';
      this.capsule(
        cooked ? 'crispy chicken tender' : 'raw chicken fillet',
        0.42,
        0.18,
        cooked ? '#c87a42' : '#e6a08c',
        p,
        0,
        0.12,
        0,
      ).scaling.set(1.15, 0.7, 0.85);
      if (cooked)
        for (let crumb = 0; crumb < 5; crumb++)
          this.sphere(
            'crunch coating',
            0.05,
            '#f0c06b',
            p,
            Math.sin(crumb * 2.4) * 0.17,
            0.22,
            Math.cos(crumb * 2.4) * 0.11,
          ).scaling.y = 0.5;
    } else if (['potato', 'cutPotato', 'cookedFries'].includes(item.kind)) {
      const cooked = item.kind === 'cookedFries';
      const pieces = cooked ? 5 : item.kind === 'potato' ? 1 : 4;
      for (let piece = 0; piece < pieces; piece++) {
        const angle = piece * 1.2;
        if (!cooked && item.kind === 'potato')
          this.sphere('russet potato', 0.24, '#bf945f', p, 0, 0.12, 0).scaling.set(1.3, 0.75, 1);
        else
          this.roundedBox(
            cooked ? 'golden fry baton' : 'fresh potato baton',
            0.09,
            0.23,
            0.085,
            0.025,
            cooked ? '#edbd54' : '#e2c18c',
            p,
            Math.cos(angle) * 0.12,
            0.15 + (piece % 2) * 0.035,
            Math.sin(angle) * 0.12,
            0.08,
          );
      }
    } else if (item.kind === 'plate') {
      item.parts.forEach((kind, index) => {
        const ingredient = this.food({ id: 'plated-ingredient', kind, parts: [] });
        ingredient.parent = p;
        ingredient.scaling.setAll(0.56);
        ingredient.position.set((index - 1) * 0.13, 0.075 + index * 0.025, 0);
      });
    } else if (item.kind === 'dirtyPlate') {
      // Crumbs and sauce are already on the ceramic plate.
    } else if (/-signature-(raw|cooked)$/.test(item.kind)) {
      const region = item.kind.split('-')[0];
      const cooked = item.kind.endsWith('-cooked');
      if (region === 'tide') {
        this.capsule(
          'tuna loin',
          0.38,
          0.18,
          cooked ? '#a85e4b' : '#d27b62',
          p,
          0,
          0.12,
          0,
        ).scaling.set(1.1, 0.6, 0.85);
        for (let stripe = -1; stripe <= 1; stripe++)
          this.tube(
            'tuna grain',
            [new Vector3(-0.15, 0.16, stripe * 0.07), new Vector3(0.14, 0.16, stripe * 0.07)],
            0.009,
            '#ffd6a6',
            p,
          );
      } else if (region === 'orbit') {
        this.sphere(
          'meteor mushroom cap',
          0.25,
          cooked ? '#8f695c' : '#c29c85',
          p,
          0,
          0.18,
          0,
        ).scaling.set(1.15, 0.55, 1);
        this.cylinder('mushroom stem', 0.13, 0.2, '#ead8bb', p, 0, 0.09, 0);
        for (let spot = 0; spot < 4; spot++)
          this.sphere(
            'mushroom fleck',
            0.035,
            '#f4e5c8',
            p,
            Math.sin(spot * 1.6) * 0.12,
            0.29,
            Math.cos(spot * 1.6) * 0.1,
          );
      } else {
        this.capsule(
          region === 'olive' ? 'chicken tender' : 'beef strip',
          0.42,
          0.17,
          cooked ? '#ad6847' : region === 'olive' ? '#e7a28d' : '#cf7760',
          p,
          0,
          0.12,
          0,
        ).scaling.set(1.2, 0.65, 0.8);
        if (cooked)
          for (let sear = -1; sear <= 1; sear++)
            this.roundedBox(
              'seared protein mark',
              0.2,
              0.014,
              0.022,
              0.006,
              '#f1bd74',
              p,
              sear * 0.09,
              0.205,
              0,
              0.5,
            );
      }
    } else if (/(tide|olive|lantern|orbit)-late-(raw|prepared|cooked)$/.test(item.kind)) {
      const region = item.kind.split('-')[0];
      const cooked = item.kind.endsWith('-cooked');
      if (region === 'tide') {
        for (let roe = 0; roe < 12; roe++)
          this.sphere(
            'roe pearls',
            0.045,
            cooked ? '#ed885d' : '#e9a55f',
            p,
            Math.sin(roe * 2.4) * 0.16,
            0.1 + (roe % 3) * 0.03,
            Math.cos(roe * 2.4) * 0.14,
          );
      } else if (region === 'olive') {
        for (let cube = 0; cube < 5; cube++)
          this.roundedBox(
            'fresh cheese cube',
            0.12,
            0.11,
            0.1,
            0.025,
            cooked ? '#d8ad5b' : '#f4e3b7',
            p,
            Math.sin(cube * 1.25) * 0.16,
            0.1,
            Math.cos(cube * 1.25) * 0.14,
          );
      } else if (region === 'lantern') {
        for (let fold = 0; fold < 4; fold++)
          this.sphere(
            'dumpling wrapper parcel',
            0.14,
            cooked ? '#d39a5e' : '#f1ddb4',
            p,
            (fold - 1.5) * 0.13,
            0.13,
            Math.sin(fold) * 0.08,
          ).scaling.set(1, 0.75, 0.65);
      } else {
        for (let leafIndex = 0; leafIndex < 6; leafIndex++)
          leaf(
            'comet greens',
            Math.sin(leafIndex * 1.05) * 0.13,
            0.12,
            Math.cos(leafIndex * 1.05) * 0.13,
            leafIndex,
            0.56,
          );
      }
    } else if (cuisineFood(this.art(), p, item.kind)) {
      // Recipe-specific geometry supplied by the shared art catalogue.
    } else {
      const color = items.get(item.kind)?.color ?? '#b87947';
      const ingredient = this.sphere('fresh prepared ingredient', 0.39, color, p, 0, 0.1, 0);
      ingredient.scaling.set(1.08, 0.62, 0.8);
      this.sphere('ingredient fresh highlight', 0.09, '#f7d594', p, -0.1, 0.22, 0.1).scaling.set(
        1,
        0.35,
        0.65,
      );
    }
    // The actual third recipe component distinguishes regional finished dishes.
    // Reuse its existing prepared model rather than inventing new recipe ingredients.
    if (recipe && /^(tide|olive|lantern)-/.test(recipe.id)) {
      const kind = recipe.components[2];
      const component = this.food({ id: 'plating-accent', kind, parts: [] });
      component.parent = p;
      component.position.set(0, recipe.id.startsWith('tide') ? 0.27 : 0.23, 0.13);
      component.scaling.setAll(0.66);
    }
    this.batchStatic(p);
    p.getChildMeshes().forEach((mesh) => {
      mesh.isPickable = false;
      this.shadows.removeShadowCaster(mesh);
    });
    return p;
  }
  private pose(
    rig: CharacterRig | undefined,
    walking: boolean,
    carrying: boolean,
    id: string,
    action: string,
  ) {
    if (!rig) return;
    const running = this.state?.phase === 'playing' && !this.reducedMotion;
    const expression = chefExpression(this.state, id, this.presentation.pulse(`chef:${id}`));
    this.animateFace(rig, expression, running);
    const stride = running && walking ? Math.sin(this.time * 11) : 0;
    const idle = running && !walking ? Math.sin(this.time * 2.2) : 0;
    let pulse = running && !walking ? this.presentation.pulse(`chef:${id}`) : 0;
    const chef = this.state?.chefs[id];
    if (running && !walking && chef)
      for (const station of this.state?.stations ?? [])
        if (Math.hypot(chef.x - station.x, chef.z - station.z) <= 1.05)
          pulse = Math.max(pulse, this.presentation.pulse(`station:${station.id}`));
    const blend = 1 - Math.exp(-18 * Math.min(0.1, this.frameDeltaMs / 1000));
    const work = pulse * Math.sin(this.time * 20);
    const reach = action === 'seat' ? -1.7 : action === 'sink' ? -1.1 : -0.9;
    const left = carrying ? -1.35 : stride * 0.6 + pulse * reach;
    const right = carrying ? -1.35 : -stride * 0.6 + pulse * reach + work * 0.35;
    rig.leftArm.rotation.x += (left - rig.leftArm.rotation.x) * blend;
    rig.rightArm.rotation.x += (right - rig.rightArm.rotation.x) * blend;
    rig.torso.scaling.y = 1 + idle * 0.02 - pulse * 0.06;
    rig.torso.scaling.x = 1 + pulse * 0.045;
    rig.head.rotation.x = -0.22 + pulse * 0.14 + (expression === 'disappointed' ? 0.14 : 0);
    rig.head.rotation.z = running
      ? Math.sin(this.time * 1.4) * 0.025 +
        (expression === 'confused' ? 0.13 : expression === 'proud' ? -0.07 : 0)
      : 0;
    rig.leftArm.rotation.z = -stride * 0.42 - (carrying ? 0.18 : 0) + idle * 0.035;
    rig.rightArm.rotation.z = stride * 0.42 + (carrying ? 0.18 : 0) - idle * 0.035;
    rig.leftLeg.rotation.x = stride * 0.7;
    rig.rightLeg.rotation.x = -stride * 0.7;
    // A visual-only scale keeps the tile, collision and hand ownership unchanged.
    const cameraScale = this.cameraFrame?.profile === 'desktop-overview' ? 1 : 1.22;
    rig.root.scaling.setAll(cameraScale * (1 + pulse * 0.035));
  }

  private createCharacterFace(head: TransformNode) {
    let material = this.textureMaterials.get('shared-face-atlas');
    if (!material) {
      const texture = new DynamicTexture('eight-mood-face-atlas', 512, this.scene, true);
      paintFaceAtlas(texture.getContext() as unknown as CanvasRenderingContext2D);
      texture.hasAlpha = true;
      texture.anisotropicFilteringLevel = 4;
      texture.update(false);
      material = new PBRMaterial('shared-face-atlas', this.scene);
      material.albedoTexture = texture;
      material.useAlphaFromAlbedoTexture = true;
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
      material.backFaceCulling = false;
      material.unlit = true;
      this.textureMaterials.set('shared-face-atlas', material);
    }
    const mesh = new Mesh('character expression surface', this.scene);
    const data = new VertexData(),
      positions: number[] = [],
      indices: number[] = [];
    for (let row = 0; row <= 4; row++)
      for (let col = 0; col <= 6; col++) {
        const x = (col / 6 - 0.5) * 0.64,
          y = (0.5 - row / 4) * 0.55;
        const z =
          0.035 + 0.418 * Math.sqrt(Math.max(0, 1 - (x / 0.475) ** 2 - (y / 0.423) ** 2)) + 0.01;
        positions.push(x, y, z);
        if (col < 6 && row < 4) {
          const i = row * 7 + col;
          indices.push(i, i + 7, i + 1, i + 1, i + 7, i + 8);
        }
      }
    data.positions = positions;
    data.indices = indices;
    data.normals = [];
    VertexData.ComputeNormals(positions, indices, data.normals);
    data.uvs = faceUVs('neutral', false);
    data.applyToMesh(mesh, true);
    mesh.parent = head;
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
  private animateFace(rig: CharacterRig, expression: FaceExpression, enabled: boolean) {
    const closed = blinkAmount(this.time, rig.blinkOffset, !enabled) > 0.45;
    const key = expression + ':' + closed;
    if (key === rig.faceKey) return;
    rig.faceKey = key;
    rig.face.updateVerticesData(VertexBuffer.UVKind, faceUVs(expression, closed));
    rig.face.metadata = { expression, closed };
  }

  setLabels(labels: { id: string; node: HTMLElement }[]) {
    this.labels = labels;
  }
  update(state: Snapshot, playerId: string) {
    if (state.levelId && state.levelId !== this.levelId) {
      this.levelId = state.levelId;
      const content = getLevel(state.levelId);
      this.layout = content.stations;
      this.restaurantId = content.restaurantId;
      this.cat.setStations(this.layout);
      this.items.forEach((i) => i.node.dispose());
      this.items.clear();
      this.buildKitchen();
    }
    this.presentation.update(state);
    this.state = state;
    this.playerId = playerId;
    const ownSlot = state.session?.members.find((m) => m.id === playerId)?.slot ?? 0;
    for (const body of this.chef.getChildMeshes())
      if (
        body.name === 'team-coat' ||
        body.name === 'body' ||
        body.name.includes('puff sleeve') ||
        body.name === 'rounded jacket shoulder'
      )
        body.material = this.mat(chefColors[ownSlot], 0.92, 0);
    for (const [id, actor] of this.teammates)
      if (!state.chefs[id] || id === playerId) {
        actor.node.dispose();
        this.rigs.delete(`teammate-${id}`);
        this.teammates.delete(id);
      }
    for (const c of Object.values(state.chefs)) {
      if (c.id === playerId) continue;
      let actor = this.teammates.get(c.id);
      if (!actor) {
        const slot = state.session?.members.find((m) => m.id === c.id)?.slot ?? 1;
        const node = this.person(`teammate-${c.id}`, chefColors[slot], true).root;
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
          actor.held.position.copyFromFloats(
            characterArtContract.heldAnchor.x,
            characterArtContract.heldAnchor.y,
            characterArtContract.heldAnchor.z,
          );
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
        this.held.position.copyFromFloats(
          characterArtContract.heldAnchor.x,
          characterArtContract.heldAnchor.y,
          characterArtContract.heldAnchor.z,
        );
      }
    }
    for (const station of state.stations) {
      const item = station.item ?? station.stock.at(-1);
      const id = station.id;
      const signature = JSON.stringify([item, station.stock.length]);
      const heat = this.stationHeat.get(id);
      if (heat && this.stationHeatStates.get(id) !== station.phase) {
        const color =
          station.phase === 'burnt'
            ? '#F4513D'
            : station.phase === 'ready'
              ? '#8BE0BD'
              : station.phase === 'processing'
                ? '#FFC72C'
                : '#3C4960';
        heat.material = this.mat(color, 0.38, 0.06);
        this.stationHeatStates.set(id, station.phase);
      }
      if (this.items.get(id)?.key !== signature) {
        this.items.get(id)?.node.dispose();
        this.items.delete(id);
        if (item) {
          const node = this.food(item);
          node.metadata = { ...node.metadata, station: id };
          node.position = this.world(station);
          node.position.y =
            station.id === 'stove' && ['tide', 'olive', 'lantern'].includes(this.restaurantId)
              ? 1.24
              : 1.02;
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
        this.rigs.delete(id);
        this.guestsFed.delete(id);
        this.guests.delete(id);
      }
    state.customers.forEach((c, i) => {
      if (c.state === 'Eating') this.guestsFed.add(c.id);
      let node = this.guests.get(c.id);
      if (!node) {
        const colors = {
          vip: palette.gold,
          impatient: palette.pink,
          complex: '#6797b0',
          combo: '#9a85cb',
          regular: palette.teal,
        };
        node = this.person(c.id, colors[c.type ?? 'regular']).root;
        const head = this.rigs.get(c.id)!.head;
        if (c.type === 'vip') {
          this.cylinder('VIP crown band', 0.6, 0.1, palette.gold, head, 0, 0.35, 0);
          for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5;
            this.sphere(
              'crown jewel',
              0.09,
              '#df8068',
              head,
              Math.sin(angle) * 0.26,
              0.48,
              Math.cos(angle) * 0.26,
            );
            this.cylinder(
              'crown point',
              0.06,
              0.16,
              palette.gold,
              head,
              Math.sin(angle) * 0.26,
              0.4,
              Math.cos(angle) * 0.26,
            );
          }
        } else if (c.type === 'complex') {
          for (const x of [-0.15, 0.15])
            this.tube(
              'round spectacles',
              Array.from(
                { length: 17 },
                (_, i) =>
                  new Vector3(
                    x + Math.cos((i * Math.PI) / 8) * 0.11,
                    0.06 + Math.sin((i * Math.PI) / 8) * 0.11,
                    0.413,
                  ),
              ),
              0.012,
              '#596573',
              head,
            );
          this.tube(
            'glasses bridge',
            [new Vector3(-0.04, 0.07, 0.413), new Vector3(0.04, 0.07, 0.413)],
            0.012,
            '#596573',
            head,
          );
        } else if (c.type === 'impatient') {
          this.sphere('sport cap', 0.76, '#d77963', head, 0, 0.24, -0.02).scaling.y = 0.4;
          this.roundedBox('cap visor', 0.49, 0.055, 0.3, 0.07, '#af5848', head, 0, 0.22, 0.36);
        } else if (c.type === 'combo') {
          for (const x of [-0.09, 0.09])
            this.sphere('bow tie', 0.16, '#dca752', node, x, 0.97, 0.3).scaling.set(1, 0.65, 0.35);
        }
        this.guests.set(c.id, node);
      }
      const seat = this.layout.find((s) => s.id === c.seat);
      node.metadata = { ...node.metadata, station: seat?.id };
      if (seat) {
        const rig = this.rigs.get(c.id);
        if (rig) rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = -1.0;
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
    this.frameSamples[this.frameIndex] = this.frameDeltaMs;
    this.frameIndex = (this.frameIndex + 1) % this.frameSamples.length;
    this.frameCount = Math.min(this.frameCount + 1, this.frameSamples.length);
    // Engine delta covers the display tick, including ticks skipped by our render cap.
    // Use the interval between submitted frames so 30 FPS does not halve animation speed.
    const dt = Math.min(0.25, this.frameDeltaMs / 1000);
    this.time += dt;
    this.cat.update(dt, this.reducedMotion, this.state?.phase === 'playing');
    let budget = effectBudget(
      this.quality === 'low',
      this.reducedMotion,
      navigator.maxTouchPoints > 0,
    );
    let activeEffects = 0;
    for (const station of this.state?.stations ?? []) {
      const particles = this.effects.get(station.id);
      if (!particles) continue;
      const pulse = this.presentation.pulse(`station:${station.id}`);
      const processing = station.phase === 'processing';
      const active =
        this.state?.phase === 'playing' && (pulse > 0 || processing || station.phase === 'burnt');
      for (let i = 0; i < particles.length; i++) {
        const mesh = particles[i];
        const knife = mesh.name === 'chopping blade';
        const burst = mesh.name === 'comic completion burst';
        const enabled =
          active &&
          (!knife || (pulse > 0 && station.progress > 0)) &&
          (!burst || (pulse > 0 && (station.phase === 'ready' || station.kind === 'seat'))) &&
          budget > 0 &&
          (this.quality !== 'low' || i === 0);
        mesh.setEnabled(enabled);
        if (!enabled) continue;
        budget--;
        activeEffects++;
        const sink = station.kind === 'sink';
        const prep = station.kind === 'board';
        const burnt = station.phase === 'burnt';
        const ready = station.phase === 'ready' || station.kind === 'seat';
        const effectColor = burnt
          ? '#F4513D'
          : sink
            ? '#65C9DB'
            : ready
              ? '#FFC72C'
              : prep
                ? '#8BE0BD'
                : station.id === 'mixer'
                  ? '#6937C8'
                  : '#F07B32';
        mesh.material = this.mat(effectColor);
        const t = (this.time * (prep ? 2.2 : 0.85) + i / 3) % 1;
        mesh.position.y = 1.13 + t * (prep ? 0.2 : 0.65);
        mesh.position.x = Math.cos(this.time * (prep ? 5 : 2) + i * 2.1) * 0.22;
        mesh.position.z = Math.sin(this.time * (prep ? 5 : 2) + i * 2.1) * 0.22;
        mesh.scaling.setAll((sink ? 0.65 : 0.5) + t * 0.7);
        mesh.visibility = (burnt ? 0.5 : 0.65) * (1 - t);
        if (burst) {
          mesh.position.set(0, 1.22, 0);
          mesh.rotation.y = this.time * 0.4;
          mesh.scaling.setAll(0.9 + (1 - pulse) * 0.5);
          mesh.visibility = pulse * 0.75;
        }
        if (knife) {
          mesh.material = this.mat('#3C4960');
          mesh.position.set(0, 1.18 + Math.abs(Math.sin(this.time * 20)) * 0.18, 0);
          mesh.scaling.setAll(1);
          mesh.visibility = 1;
        } else if (station.kind === 'stove' && processing && i === 0) {
          mesh.material = this.mat('#F4513D');
          mesh.position.y = 0.98;
          mesh.scaling.set(0.7, 1 + Math.sin(this.time * 9) * 0.25, 0.7);
          mesh.visibility = 0.75;
        }
      }
    }
    this.canvas.dataset.activeEffects = String(activeEffects);
    if (this.time - this.telemetryAt > 1) {
      this.telemetryAt = this.time;
      const rect = this.canvas.getBoundingClientRect();
      const samples = Array.from(this.frameSamples.subarray(0, this.frameCount)).sort(
        (a, b) => a - b,
      );
      const info = {
        css: [rect.width, rect.height],
        buffer: [this.engine.getRenderWidth(), this.engine.getRenderHeight()],
        dpr: window.devicePixelRatio,
        hardwareScalingLevel: this.engine.getHardwareScalingLevel(),
        effectiveScale: this.engine.getRenderWidth() / Math.max(1, rect.width),
        profile: this.quality === 'standard' ? 'balanced' : this.quality,
        sharpness: this.sharpness,
        fps:
          1000 /
          Math.max(1, samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length)),
        targetFps: this.renderTargetFps,
        shadowMapSize: this.shadows.mapSize,
        shadowMode: this.shadows.usePoissonSampling ? 'poisson' : 'blur',
        renderedFrames: this.renderedFrames,
        shadowRenderedFrames: this.shadowRenderedFrames,
        faces: [...this.rigs.values()].map((rig) => rig.faceKey),
        characterArtVersion: characterArtContract.version,
        sceneBuildMs: this.sceneBuildMs,
        sceneReadyMs: this.sceneReadyMs,
        characterSlots: [...this.rigs.values()].map((rig) => Object.keys(rig.slots)),
        characterBindingsValid: [...this.rigs.values()].every(
          (rig) =>
            rig.root.metadata?.artVersion === characterArtContract.version &&
            Object.entries(rig.slots).every(
              ([slot, node]) => node.name === rig.root.metadata?.slots?.[slot],
            ),
        ),
        frameMs: this.frameDeltaMs,
        frameMean: samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length),
        frameP95: samples[Math.floor((samples.length - 1) * 0.95)],
        frameP99: samples[Math.floor((samples.length - 1) * 0.99)],
        renderer: this.engine.getGlInfo(),
        zoom: this.cameraZoom,
      };
      this.canvas.dataset.resolutionStats = JSON.stringify(info);
      if (this.renderDebug) this.debugPanel.textContent = JSON.stringify(info, null, 2);

      const geometries = new Set<number>();
      let geometryBytesEstimated = 0;
      for (const mesh of this.scene.meshes) {
        const geometry = mesh.geometry;
        if (!geometry || geometries.has(geometry.uniqueId)) continue;
        geometries.add(geometry.uniqueId);
        geometryBytesEstimated += geometry.getTotalVertices() * 32 + geometry.getTotalIndices() * 4;
      }
      const textureBytesEstimated = this.scene.textures.reduce((total, texture) => {
        const size = texture.getSize();
        const faces = texture.isCube ? 6 : 1;
        return total + Math.ceil(size.width * size.height * 4 * faces * 1.33);
      }, 0);
      this.canvas.dataset.renderStats = JSON.stringify({
        meshes: this.scene.meshes.length,
        activeMeshes: this.scene.getActiveMeshes().length,
        drawCalls: this.instrumentation.drawCallsCounter.current,
        drawCallsMean:
          this.drawSamples.subarray(0, this.frameCount).reduce((sum, n) => sum + n, 0) /
          Math.max(1, this.frameCount),
        materials: this.scene.materials.length,
        uniqueGeometries: geometries.size,
        fps: Math.round(info.fps),
        triangles: this.scene.meshes.reduce((sum, m) => sum + m.getTotalIndices(), 0) / 3,
        geometryBytesEstimated,
        textureBytesEstimated,
        shadowCasters: this.shadows.getShadowMap()?.renderList?.length ?? 0,
        quality: this.quality,
      });
    }
    for (const [id, actor] of this.teammates) {
      const player = this.state?.chefs[id];
      if (!player) continue;
      const target = this.movementTarget.set(player.x - 7, 0, player.z - 5);
      const dx = target.x - actor.node.position.x,
        dz = target.z - actor.node.position.z;
      if (Math.hypot(dx, dz) > 0.025) actor.node.rotation.y = Math.atan2(dx, dz);
      Vector3.LerpToRef(actor.node.position, target, 1 - Math.exp(-18 * dt), actor.node.position);
      actor.node.position.y =
        !this.reducedMotion && player.path.length ? Math.abs(Math.sin(this.time * 13)) * 0.08 : 0;
      this.pose(
        this.rigs.get(`teammate-${id}`),
        Boolean(player.path.length),
        Boolean(player.item),
        player.id,
        player.action,
      );
    }
    if (this.state?.session) {
      for (const member of this.state.session.members) {
        const node = member.id === this.playerId ? this.chef : this.teammates.get(member.id)?.node;
        if (!node) continue;
        const emote = this.state.session.signals.find(
          (s) => s.type === 'emote' && s.from === member.id,
        );
        const size = this.cameraFrame?.profile === 'desktop-overview' ? 1 : 1.22;
        node.scaling.setAll(
          size * (emote && !this.reducedMotion ? 1 + Math.sin(this.time * 8) * 0.06 : 1),
        );
      }
    }
    const c = this.state?.chefs[this.playerId];
    if (c) {
      const dest = this.movementTarget.set(c.x - 7, 0, c.z - 5);
      const moving = Vector3.Distance(this.chef.position, dest) > 0.025;
      if (moving) {
        this.chef.rotation.y = Math.atan2(
          dest.x - this.chef.position.x,
          dest.z - this.chef.position.z,
        );
      }
      Vector3.LerpToRef(this.chef.position, dest, 1 - Math.exp(-18 * dt), this.chef.position);
      this.chef.position.y =
        !this.reducedMotion && c.path.length && this.state?.phase === 'playing'
          ? Math.abs(Math.sin(this.time * 13)) * 0.08
          : 0;
      this.pose(this.rigs.get('chef'), Boolean(c.path.length), Boolean(c.item), c.id, c.action);
      const destination = c.path.at(-1);
      this.marker.setEnabled(Boolean(destination));
      if (destination) {
        this.marker.position.set(destination.x - 7, 0.045, destination.z - 5);
      }
      this.routeDots.forEach((dot, index) => {
        const point = c.path[index];
        dot.setEnabled(Boolean(point));
        if (point) {
          dot.position.set(point.x - 7, 0.04, point.z - 5);
        }
      });
      if (this.cameraOverview || !this.cameraFrame) {
        this.camera.target.set(0, 0, 0);
      } else {
        const frame = this.cameraFrame;
        const target = cameraTarget(c, frame);
        if (this.reducedMotion) this.camera.target.set(target.x, 0, target.z);
        else {
          const smoothing = 1 - Math.exp(-7 * dt);
          this.camera.target.x += (target.x - this.camera.target.x) * smoothing;
          this.camera.target.z += (target.z - this.camera.target.z) * smoothing;
        }
      }
    }
    if (this.state?.phase === 'playing')
      this.state.customers.forEach((c) => {
        const n = this.guests.get(c.id);
        const rig = this.rigs.get(c.id);
        if (rig) {
          this.animateFace(
            rig,
            c.state === 'Eating'
              ? 'happy'
              : c.state === 'Leaving'
                ? this.guestsFed.has(c.id)
                  ? 'proud'
                  : 'disappointed'
                : c.patience < Math.min(20, c.maxPatience * 0.25)
                  ? 'focused'
                  : 'neutral',
            !this.reducedMotion,
          );
          const motion = this.reducedMotion
            ? 0
            : Math.sin(this.time * (c.state === 'Eating' ? 6 : 2.5));
          const urgent = c.patience < Math.min(20, c.maxPatience * 0.25);
          const reaction = this.reducedMotion ? 0 : this.presentation.pulse(`guest:${c.id}`);
          rig.rightArm.rotation.x =
            c.state === 'Eating'
              ? -1.1 + motion * 0.2 - reaction * 0.35
              : urgent
                ? -0.8
                : motion * 0.08;
          rig.leftArm.rotation.x = c.state === 'Eating' ? -0.85 - reaction * 0.25 : 0;
          rig.head.rotation.x = -0.22 + (c.state === 'Eating' ? -0.08 - reaction * 0.08 : 0);
          rig.head.rotation.z = motion * (urgent ? 0.09 : 0.025);
          rig.torso.rotation.x = c.state === 'Leaving' ? 0.12 : 0;
        }
        if (n)
          n.position.y =
            (c.seat ? 0.18 : 0) +
            (this.reducedMotion
              ? 0
              : c.state === 'Eating'
                ? Math.sin(this.time * 5) * 0.025
                : Math.sin(this.time * 2) * 0.015);
      });
    for (const rig of this.rigs.values()) rig.contact.position.y = 0.012 - rig.root.position.y;
  }
  private positionLabels() {
    const w = this.engine.getRenderWidth(),
      h = this.engine.getRenderHeight();
    const rect = this.canvas.getBoundingClientRect();
    const viewport = this.camera.viewport.toGlobal(w, h);
    const transform = this.scene.getTransformMatrix();
    const localChef = this.state?.chefs[this.playerId];
    const showCatAction =
      document.body.dataset.screen === 'game' &&
      this.state?.phase === 'playing' &&
      this.cat.isNear(localChef);
    this.catAction.hidden = !showCatAction;
    if (showCatAction) {
      this.labelWorld.set(this.cat.position.x, 1.47, this.cat.position.z);
      Vector3.ProjectToRef(
        this.labelWorld,
        Matrix.IdentityReadOnly,
        transform,
        viewport,
        this.labelProjection,
      );
      const x = rect.left + (this.labelProjection.x / w) * rect.width;
      const y = rect.top + (this.labelProjection.y / h) * rect.height;
      const inset = Math.min(70, rect.width / 2);
      this.catAction.style.left = `${Math.max(rect.left + inset, Math.min(rect.right - inset, x))}px`;
      this.catAction.style.top = `${Math.max(rect.top + 38, Math.min(rect.bottom - 48, y))}px`;
    }
    const compactMobile = this.cameraFrame?.profile !== 'desktop-overview';
    let onScreen = 0;
    let edgeMarkers = 0;
    for (const { id, node } of this.labels) {
      if (!compactMobile) node.dataset.compact = 'false';
      const s = this.layout.find((s) => s.id === id);
      // The HUD can switch levels before the first authoritative snapshot arrives.
      if (!s || !node.isConnected) continue;
      this.labelWorld.set(s.x - 7, 1.85, s.z - 5);
      const chef = this.state?.chefs[this.playerId];
      const dx = chef ? chef.x - s.x : Number.POSITIVE_INFINITY;
      const dz = chef ? chef.z - s.z : Number.POSITIVE_INFINITY;
      const nearby = dx * dx + dz * dz <= 7.5;
      const priority =
        Boolean(node.dataset.feedback) ||
        node.classList.contains('station-ready') ||
        node.classList.contains('station-burnt') ||
        node.classList.contains('station-target') ||
        node.classList.contains('station-guidance') ||
        node.classList.contains('station-ping');
      const context = priority ? 'priority' : nearby ? 'nearby' : 'idle';
      if (node.dataset.context !== context) node.dataset.context = context;
      Vector3.ProjectToRef(
        this.labelWorld,
        Matrix.IdentityReadOnly,
        transform,
        viewport,
        this.labelProjection,
      );
      const screenX = rect.left + (this.labelProjection.x / w) * rect.width;
      const screenY = rect.top + (this.labelProjection.y / h) * rect.height;
      const inFrame =
        this.labelProjection.z >= 0 &&
        this.labelProjection.z <= 1 &&
        screenX >= rect.left &&
        screenX <= rect.right &&
        screenY >= rect.top &&
        screenY <= rect.bottom;
      if (inFrame) onScreen++;
      const componentSource = id.startsWith('ingredient-');
      const actionable = priority || nearby || (compactMobile && componentSource);
      const edge = !inFrame && actionable && this.cameraFrame?.profile !== 'desktop-overview';
      if (edge) edgeMarkers++;
      const visible =
        edge ||
        (inFrame &&
          (!compactMobile || this.showAllStationLabels || priority || nearby || componentSource));
      const visibility = visible ? 'visible' : 'hidden';
      if (node.style.visibility !== visibility) node.style.visibility = visibility;
      node.style.pointerEvents = visible ? 'auto' : 'none';
      node.tabIndex = visible ? 0 : -1;
      node.setAttribute('aria-hidden', String(!visible));
      if (node.dataset.onScreen !== String(inFrame)) node.dataset.onScreen = String(inFrame);
      if (node.dataset.offscreen !== String(edge)) node.dataset.offscreen = String(edge);
      node.dataset.overlapHidden = 'false';
      const bounds = node.getBoundingClientRect();
      const halfWidth = bounds.width / 2;
      if (edge) {
        // Labels anchor by their bottom edge, so keep the full pill inside the
        // canvas. This also prevents offscreen action markers from being clipped
        // by the mobile safe area.
        const minX = rect.left + halfWidth + 8;
        const maxX = rect.right - halfWidth - 8;
        const minY = rect.top + bounds.height + 8;
        const maxY = rect.bottom - 8;
        const x = minX <= maxX ? Math.max(minX, Math.min(maxX, screenX)) : innerWidth / 2;
        const y = minY <= maxY ? Math.max(minY, Math.min(maxY, screenY)) : innerHeight / 2;
        const direction = Math.atan2(
          screenY - (rect.top + rect.height / 2),
          screenX - (rect.left + rect.width / 2),
        );
        const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'] as const;
        const arrow = arrows[(Math.round(direction / (Math.PI / 4)) + 8) % 8];
        if (node.dataset.arrow !== arrow) node.dataset.arrow = arrow;
        node.setAttribute(
          'aria-label',
          `${arrow} ${node.querySelector('span')?.textContent ?? id}`,
        );
        node.style.left = `${Math.round(x)}px`;
        node.style.top = `${Math.round(y)}px`;
      } else {
        if (node.dataset.arrow) delete node.dataset.arrow;
        if (node.getAttribute('aria-label')) node.removeAttribute('aria-label');
        // Even hidden, inactive labels must keep a valid box: levels can switch
        // before the next snapshot and mobile assistive tooling inspects all
        // station controls in the DOM. Clamp against viewport edges while
        // preserving the normal canvas projection whenever it fits.
        const x = Math.max(halfWidth + 4, Math.min(innerWidth - halfWidth - 4, screenX));
        const y = Math.max(bounds.height + 4, Math.min(innerHeight - 4, screenY));
        node.style.left = `${Math.round(x)}px`;
        node.style.top = `${Math.round(y)}px`;
      }
    }
    if (compactMobile) {
      // Nearby/important labels get first choice of space; inactive distant pills
      // stay out of the way unless the player enabled the full-label setting.
      const visible = this.labels
        .map(({ node }) => node)
        .filter((node) => node.isConnected && node.style.visibility === 'visible')
        .sort((a, b) => {
          const rank = (node: HTMLElement) =>
            node.dataset.offscreen === 'true' || node.dataset.context === 'priority'
              ? 2
              : node.dataset.context === 'nearby'
                ? 1
                : 0;
          return rank(b) - rank(a);
        });
      const placed: DOMRect[] = [];
      visible.forEach((node, index) => {
        node.dataset.compact = String(
          !this.showAllStationLabels && index >= 4 && node.dataset.componentSource !== 'true',
        );
      });
      const chef = this.state?.chefs[this.playerId];
      let chefBlock: DOMRect | null = null;
      if (chef) {
        this.labelWorld.set(chef.x - 7, 1.65, chef.z - 5);
        Vector3.ProjectToRef(
          this.labelWorld,
          Matrix.IdentityReadOnly,
          transform,
          viewport,
          this.labelProjection,
        );
        const x = rect.left + (this.labelProjection.x / w) * rect.width;
        const y = rect.top + (this.labelProjection.y / h) * rect.height;
        chefBlock = new DOMRect(x - 24, y - 58, 48, 64);
      }
      for (const node of visible) {
        const baseBottom = Number.parseFloat(node.style.top) || rect.top;
        const bounds = node.getBoundingClientRect();
        const step = Math.max(20, bounds.height + 4);
        const offsets = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5];
        let placement: DOMRect | null = null;
        for (const offset of offsets) {
          node.style.top = `${baseBottom + offset * step}px`;
          const candidate = node.getBoundingClientRect();
          const inside =
            candidate.left >= rect.left + 3 &&
            candidate.right <= rect.right - 3 &&
            candidate.top >= rect.top + 3 &&
            candidate.bottom <= rect.bottom - 3;
          const overlaps = placed.some(
            (other) =>
              candidate.left < other.right + 3 &&
              candidate.right + 3 > other.left &&
              candidate.top < other.bottom + 3 &&
              candidate.bottom + 3 > other.top,
          );
          const overlapsChef =
            chefBlock !== null &&
            candidate.left < chefBlock.right &&
            candidate.right > chefBlock.left &&
            candidate.top < chefBlock.bottom &&
            candidate.bottom > chefBlock.top;
          if (inside && !overlaps && !overlapsChef) {
            placement = candidate;
            break;
          }
        }
        if (placement) placed.push(placement);
        else if (node.dataset.context !== 'priority' && node.dataset.offscreen !== 'true') {
          node.style.visibility = 'hidden';
          node.style.pointerEvents = 'none';
          node.tabIndex = -1;
          node.setAttribute('aria-hidden', 'true');
          node.dataset.overlapHidden = 'true';
        } else {
          const y = Math.max(rect.top + bounds.height + 4, Math.min(rect.bottom - 4, baseBottom));
          node.style.top = `${y}px`;
          placed.push(node.getBoundingClientRect());
        }
      }
    }
    if (this.time - this.cameraTelemetryAt >= 0.5 && this.cameraFrame) {
      this.cameraTelemetryAt = this.time;
      const frame = this.cameraFrame;
      const localChef = this.state?.chefs[this.playerId];
      const canvasRect = this.canvas.getBoundingClientRect();
      const stageBounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      for (const [x, z] of [
        [-7.5, -5.5],
        [7.5, -5.5],
        [7.5, 5.5],
        [-7.5, 5.5],
      ]) {
        this.labelWorld.set(x, 0, z);
        Vector3.ProjectToRef(
          this.labelWorld,
          Matrix.IdentityReadOnly,
          this.scene.getTransformMatrix(),
          this.camera.viewport.toGlobal(
            this.engine.getRenderWidth(),
            this.engine.getRenderHeight(),
          ),
          this.labelProjection,
        );
        const xPx =
          canvasRect.left +
          (this.labelProjection.x / this.engine.getRenderWidth()) * canvasRect.width;
        const yPx =
          canvasRect.top +
          (this.labelProjection.y / this.engine.getRenderHeight()) * canvasRect.height;
        stageBounds.left = Math.min(stageBounds.left, xPx);
        stageBounds.right = Math.max(stageBounds.right, xPx);
        stageBounds.top = Math.min(stageBounds.top, yPx);
        stageBounds.bottom = Math.max(stageBounds.bottom, yPx);
      }
      const stageVisible = {
        left: Math.max(canvasRect.left, stageBounds.left),
        top: Math.max(canvasRect.top, stageBounds.top),
        right: Math.min(canvasRect.right, stageBounds.right),
        bottom: Math.min(canvasRect.bottom, stageBounds.bottom),
      };
      const labelNodes = this.labels.map(({ node }) => node);
      const visibleLabels = labelNodes
        .filter((node) => node.isConnected && node.style.visibility === 'visible')
        .map((node) => node.getBoundingClientRect());
      let labelOverlapPairs = 0;
      for (let i = 0; i < visibleLabels.length; i++)
        for (let j = i + 1; j < visibleLabels.length; j++) {
          const a = visibleLabels[i];
          const b = visibleLabels[j];
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
            labelOverlapPairs++;
        }
      this.canvas.dataset.cameraStats = JSON.stringify({
        profile: frame.profile,
        orthoWidth: Number((frame.width / this.cameraZoom).toFixed(2)),
        orthoHeight: Number((frame.height / this.cameraZoom).toFixed(2)),
        zoom: Number(this.cameraZoom.toFixed(2)),
        targetX: Number(this.camera.target.x.toFixed(2)),
        targetZ: Number(this.camera.target.z.toFixed(2)),
        targetBoundX: frame.followX,
        targetBoundZ: frame.followZ,
        chefHeightPx: Math.round(
          (canvasRect.height *
            1.6 *
            this.cameraZoom *
            (frame.profile === 'desktop-overview' ? 1 : 1.22)) /
            frame.height,
        ),
        chefX: localChef ? Number((localChef.x - 7).toFixed(2)) : null,
        chefZ: localChef ? Number((localChef.z - 5).toFixed(2)) : null,
        stationsInFrame: onScreen,
        edgeMarkers,
        stageBoundsPx: {
          x: Math.round(stageVisible.left - canvasRect.left),
          y: Math.round(stageVisible.top - canvasRect.top),
          width: Math.max(0, Math.round(stageVisible.right - stageVisible.left)),
          height: Math.max(0, Math.round(stageVisible.bottom - stageVisible.top)),
        },
        stageCanvasAreaPercent: Number(
          (
            (Math.max(0, stageVisible.right - stageVisible.left) *
              Math.max(0, stageVisible.bottom - stageVisible.top) *
              100) /
            Math.max(1, canvasRect.width * canvasRect.height)
          ).toFixed(1),
        ),
        stationLabelsVisible: visibleLabels.length,
        stationLabelsOverlapPairs: labelOverlapPairs,
        stationLabelsHiddenForOverlap: labelNodes.filter(
          (node) => node.dataset.overlapHidden === 'true',
        ).length,
      });
    }
  }
}
