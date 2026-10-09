import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { Node } from '@babylonjs/core/node';

export type ModelSource = string | File | ArrayBufferView;

export class ModelAssetInstance {
  constructor(
    readonly key: string,
    readonly root: TransformNode,
    readonly entries: InstantiatedEntries,
  ) {}

  playAnimations(loop = true) {
    this.entries.animationGroups.forEach((group) => group.start(loop));
  }

  dispose() {
    this.entries.dispose();
    this.root.dispose(false, false);
  }
}

/** Scene-scoped, lazy GLB cache. Procedural visuals remain the caller's fallback. */
export class ModelAssetLibrary {
  private containers = new Map<string, { source: ModelSource; promise: Promise<AssetContainer> }>();
  private instances = new Set<ModelAssetInstance>();
  private loader: Promise<unknown> | null = null;

  constructor(private readonly scene: Scene) {}

  load(key: string, source: ModelSource): Promise<AssetContainer> {
    const cached = this.containers.get(key);
    if (cached) {
      if (cached.source !== source)
        return Promise.reject(
          new Error(`Model asset key '${key}' is already assigned to another source`),
        );
      return cached.promise;
    }
    this.loader ??= import('@babylonjs/loaders/glTF/2.0');
    const promise = this.loader.then(() =>
      LoadAssetContainerAsync(source, this.scene, { pluginExtension: '.glb' }),
    );
    this.containers.set(key, { source, promise });
    void promise.catch(() => {
      if (this.containers.get(key)?.promise === promise) this.containers.delete(key);
    });
    return promise;
  }

  async instantiate(key: string, source: ModelSource, parent?: TransformNode) {
    const container = await this.load(key, source);
    const entries = container.instantiateModelsToScene((name) => `${key}/${name}`);
    const root = new TransformNode(`${key}/instance`, this.scene);
    for (const node of entries.rootNodes)
      (node as Node & { parent: TransformNode | null }).parent = root;
    root.parent = parent ?? null;
    const instance = new ModelAssetInstance(key, root, entries);
    this.instances.add(instance);
    return instance;
  }

  disposeInstance(instance: ModelAssetInstance) {
    if (!this.instances.delete(instance)) return;
    instance.dispose();
  }

  dispose() {
    for (const instance of this.instances) instance.dispose();
    this.instances.clear();
    for (const { promise } of this.containers.values())
      void promise.then((container) => container.dispose()).catch(() => undefined);
    this.containers.clear();
  }

  get cachedAssetCount() {
    return this.containers.size;
  }

  get liveInstanceCount() {
    return this.instances.size;
  }
}
