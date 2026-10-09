import { describe, it, expect } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { roundedGeometry, copyGeometry } from '../apps/client/src/game/rounded-geometry';
import {
  buildRestaurant,
  cuisineFood,
  dressStation,
  sharedFloorMaterials,
  type ArtTools,
} from '../apps/client/src/game/restaurant-art';
import { floorPixels } from '../apps/client/src/game/floor-texture';
import { items, dishRecipe, levels, restaurants } from '../packages/content/src/campaign';
import {
  roundedBoxSegments,
  sphereSegments,
  cylinderSegments,
  tubeSegments,
  materialFinish,
} from '../apps/client/src/game/geometry-budget';

function harness() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const place = (mesh: Mesh, parent?: TransformNode, x = 0, y = 0, z = 0) => {
    mesh.parent = parent ?? null;
    mesh.position.set(x, y, z);
    return mesh;
  };
  const a: ArtTools = {
    scene,
    box(name, w, h, d, r, _color, p, x, y, z) {
      const m = new Mesh(name, scene);
      roundedGeometry(w, h, d, r).applyToMesh(m);
      return place(m, p, x, y, z);
    },
    sphere(name, size, _color, p, x, y, z) {
      return place(
        MeshBuilder.CreateSphere(name, { diameter: size, segments: 12 }, scene),
        p,
        x,
        y,
        z,
      );
    },
    cylinder(name, d, h, _color, p, x, y, z) {
      return place(
        MeshBuilder.CreateCylinder(name, { diameter: d, height: h, tessellation: 24 }, scene),
        p,
        x,
        y,
        z,
      );
    },
    tube(name, points, r, _color, p) {
      return place(MeshBuilder.CreateTube(name, { path: points, radius: r }, scene), p);
    },
    lathe(name, profile, _color, p, x, y, z) {
      return place(MeshBuilder.CreateLathe(name, { shape: profile }, scene), p, x, y, z);
    },
    leaf(name, _color, p, x, y, z, angle, scale) {
      const mesh = MeshBuilder.CreateSphere(
        name,
        { diameter: 0.3 * (scale ?? 1), segments: 8 },
        scene,
      );
      mesh.scaling.set(1, 0.16, 0.6);
      mesh.rotation.y = angle ?? 0;
      return place(mesh, p, x, y, z);
    },
  };
  return {
    a,
    scene,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}

describe('procedural art geometry', () => {
  it('budgets tessellation for the isometric camera scale', () => {
    expect(roundedBoxSegments(0.96, 0.69, 0.92, 0.085)).toBe(2);
    expect(roundedBoxSegments(0.28, 0.28, 0.28, 0.09)).toBe(4);
    expect(roundedBoxSegments(0.02, 0.02, 0.02, 0.005)).toBe(2);
    expect(sphereSegments(0.04)).toBe(6);
    expect(sphereSegments(0.16)).toBe(8);
    expect(cylinderSegments(0.08)).toBe(8);
    expect(tubeSegments(0.008)).toBe(4);
    expect(materialFinish(0.74, 0.02)).toEqual({ roughness: 0.68, metallic: 0 });
    expect(materialFinish(0.76, 0.48)).toEqual({ roughness: 0.68, metallic: 0.42 });
    const cabinet = roundedGeometry(0.96, 0.69, 0.92, 0.085);
    expect(cabinet.indices!.length / 3).toBe(48);
    expect(cabinet.indices!.length / 3).toBeLessThan(432 * 0.2);
  });
  it('generates deterministic, distinct tiled floor textures for each cuisine', () => {
    const outputs = ['tide', 'olive', 'lantern', 'orbit'].map((id) => floorPixels(id, 64));
    expect(outputs.every((p) => p.length === 64 * 64 * 4 && p.every(Number.isFinite))).toBe(true);
    expect(JSON.stringify(Array.from(outputs[0]))).toBe(
      JSON.stringify(Array.from(floorPixels('tide', 64))),
    );
    const signatures = outputs.map((p) => {
      let r = 0,
        g = 0,
        b = 0;
      for (let i = 0; i < p.length; i += 4) {
        r += p[i];
        g += p[i + 1];
        b += p[i + 2];
      }
      return [
        Math.round(r / (p.length / 4)),
        Math.round(g / (p.length / 4)),
        Math.round(b / (p.length / 4)),
      ].join(',');
    });
    expect(new Set(signatures).size).toBe(4);
  });
  it('keeps cached geometry unchanged after repeated translated merges', () => {
    const h = harness();
    try {
      const template = roundedGeometry(0.94, 0.7, 0.94, 0.08);
      const original = JSON.stringify(template.serialize());
      for (let level = 0; level < 12; level++) {
        const meshes = Array.from({ length: 3 }, (_, i) => {
          const mesh = new Mesh('cabinet', h.scene);
          copyGeometry(template).applyToMesh(mesh);
          mesh.position.set(i * 2, 0, level);
          mesh.computeWorldMatrix(true);
          return mesh;
        });
        Mesh.MergeMeshes(meshes, true, true)!.dispose();
        expect(JSON.stringify(template.serialize())).toBe(original);
      }
    } finally {
      h.dispose();
    }
  });
  it.each([
    [1, 0.7, 1, 0.08],
    [0.035, 0.28, 0.04, 0.015],
    [15, 0.025, 11, 0.01],
  ])('keeps thin and large rounded meshes finite and within bounds (%j)', (w, h, d, r) => {
    const data = roundedGeometry(w, h, d, r);
    const positions = Array.from(data.positions!),
      normals = Array.from(data.normals!);
    expect(positions.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < positions.length; i++)
      expect(Math.abs(positions[i])).toBeLessThanOrEqual([w, h, d][i % 3] / 2 + 1e-6);
    for (let i = 0; i < normals.length; i += 3)
      expect(Math.hypot(...normals.slice(i, i + 3))).toBeCloseTo(1, 5);
    // Every front-facing triangle uses the winding expected by Babylon's default handedness.
    const ix = Array.from(data.indices!);
    for (let i = 0; i < ix.length; i += 3) {
      const a = positions.slice(ix[i] * 3, ix[i] * 3 + 3),
        b = positions.slice(ix[i + 1] * 3, ix[i + 1] * 3 + 3),
        c = positions.slice(ix[i + 2] * 3, ix[i + 2] * 3 + 3);
      const u = b.map((v, j) => v - a[j]),
        v = c.map((v, j) => v - a[j]);
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      expect(cross.reduce((sum, v, j) => sum + v * normals[ix[i] * 3 + j], 0)).toBeLessThanOrEqual(
        1e-8,
      );
    }
  });
  it('builds every non-burger ingredient with distinct, finite geometry; rejects unknown families', () => {
    const h = harness();
    try {
      const root = new TransformNode('ingredients', h.scene);
      const ingredients = [...items.keys()].filter(
        (k) => /^(tide|olive|lantern|orbit)-/.test(k) && !dishRecipe(k),
      );
      expect(ingredients).toHaveLength(28);
      for (const kind of ingredients) {
        const model = new TransformNode(kind, h.scene);
        model.parent = root;
        expect(cuisineFood(h.a, model, kind)).toBe(true);
        expect(model.getChildMeshes().length).toBeGreaterThan(1);
        for (const mesh of model.getChildMeshes()) {
          expect(Array.from(mesh.getVerticesData('position') ?? []).every(Number.isFinite)).toBe(
            true,
          );
          expect(mesh.getTotalVertices()).toBeGreaterThan(0);
        }
      }
      expect(cuisineFood(h.a, root, 'missing')).toBe(false);
    } finally {
      h.dispose();
    }
  });
  it('builds architecture and all station variants across the 50 immutable layouts', () => {
    const h = harness();
    try {
      const before = JSON.stringify(levels);
      for (const restaurant of restaurants.filter((r) => r.id !== 'little-sun')) {
        const root = buildRestaurant(h.a, restaurant.id);
        expect(
          root.getChildMeshes().some((m) => m.name === 'walkable floor input' && m.isPickable),
        ).toBe(true);
        expect(root.getChildMeshes().filter((m) => !m.isPickable).length).toBeGreaterThan(30);
        root.dispose();
      }
      const tideA = buildRestaurant(h.a, 'tide');
      const tideMaterial = tideA
        .getChildMeshes()
        .find((m) => m.name === 'walkable floor input')!.material;
      tideA.dispose();
      const tideB = buildRestaurant(h.a, 'tide');
      expect(tideB.getChildMeshes().find((m) => m.name === 'walkable floor input')!.material).toBe(
        tideMaterial,
      );
      expect(sharedFloorMaterials(h.scene)).toContain(tideMaterial);
      tideB.dispose();
      for (const level of levels)
        for (const def of level.stations) {
          const station = new TransformNode(def.id, h.scene);
          dressStation(h.a, station, def, level.restaurantId);
          station.dispose();
        }
      expect(JSON.stringify(levels)).toBe(before);
      expect(h.scene.meshes).toHaveLength(0);
    } finally {
      h.dispose();
    }
  });
});
