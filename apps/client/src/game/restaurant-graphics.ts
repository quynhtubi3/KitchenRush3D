import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { ArtTools } from './restaurant-art';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

/** Original food-shop illustrations; baked once into two low-cost perimeter plaques. */
export function restaurantGraphics(a: ArtTools, root: TransformNode, id: string) {
  // NullEngine geometry tests have no raster canvas. Browser tests verify the actual posters.
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return;
  const texture = new DynamicTexture(`${id}-food-poster`, 256, a.scene, true);
  const c = texture.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = '#fff1d2';
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#25243a';
  c.lineWidth = 8;
  c.strokeRect(9, 9, 238, 238);
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  };
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (id === 'little-sun') {
    ellipse(128, 162, 70, 15, '#df8d46');
    ellipse(128, 137, 73, 17, '#65382f');
    c.strokeStyle = '#5c994d';
    c.lineWidth = 13;
    c.beginPath();
    c.moveTo(56, 119);
    for (let i = 0; i < 7; i++) c.lineTo(57 + i * 23, 119 + (i % 2 ? 8 : -6));
    c.stroke();
    c.strokeStyle = '#25243a';
    c.lineWidth = 8;
    ellipse(128, 90, 70, 30, '#ffc72c');
  } else if (id === 'tide') {
    ellipse(116, 128, 60, 40, '#65c9db');
    c.fillStyle = '#f4513d';
    c.beginPath();
    c.moveTo(165, 128);
    c.lineTo(214, 94);
    c.lineTo(214, 162);
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(76, 156);
    c.quadraticCurveTo(125, 180, 164, 156);
    c.stroke();
  } else if (id === 'olive') {
    ellipse(128, 135, 65, 60, '#f4513d');
    c.strokeStyle = '#19734f';
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(99, 75);
    c.lineTo(123, 94);
    c.lineTo(151, 71);
    c.moveTo(127, 84);
    c.lineTo(127, 50);
    c.stroke();
    c.strokeStyle = '#25243a';
    c.lineWidth = 8;
  } else if (id === 'lantern') {
    c.fillStyle = '#65382f';
    c.beginPath();
    c.moveTo(55, 120);
    c.quadraticCurveTo(128, 242, 201, 120);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = '#f4513d';
    c.lineWidth = 10;
    for (const x of [95, 128, 161]) {
      c.beginPath();
      c.moveTo(x, 107);
      c.bezierCurveTo(x - 24, 89, x + 24, 70, x, 50);
      c.stroke();
    }
    c.strokeStyle = '#25243a';
    c.lineWidth = 8;
  } else {
    ellipse(128, 126, 54, 54, '#6937c8');
    c.save();
    c.translate(128, 126);
    c.rotate(-0.3);
    c.strokeStyle = '#b8d26b';
    c.lineWidth = 12;
    c.beginPath();
    c.ellipse(0, 0, 90, 18, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
  // A cheeky mascot face belongs on the food illustration, never over a station.
  c.fillStyle = '#25243a';
  for (const x of [108, 140]) {
    c.beginPath();
    c.arc(x, 122, 6, 0, Math.PI * 2);
    c.fill();
  }
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(111, 140);
  c.quadraticCurveTo(125, 153, 139, 140);
  c.stroke();
  c.fillStyle = '#25243a';
  c.font = 'bold 18px sans-serif';
  c.textAlign = 'center';
  c.fillText(
    (
      {
        'little-sun': 'STACK HAPPY',
        tide: 'FRESH CATCH',
        olive: 'SAUCE CLUB',
        lantern: 'WOK THIS WAY',
        orbit: 'SPACE BITES',
      } as Record<string, string>
    )[id],
    128,
    222,
  );
  // Babylon's standard plane UVs put V=1 at the top; canvas rows must be flipped.
  texture.update(true);
  const material = new PBRMaterial(`${id}-food-poster`, a.scene);
  material.albedoTexture = texture;
  material.roughness = 0.86;
  material.unlit = true;
  for (const x of [-2.65, 2.65]) {
    const sign = MeshBuilder.CreatePlane(
      `${id} illustrated food plaque`,
      { width: 1.15, height: 1.15 },
      a.scene,
    );
    sign.parent = root;
    sign.position.set(x, 1.78, -5.045);
    sign.material = material;
    sign.isPickable = false;
    sign.rotation.z = x < 0 ? 0.055 : -0.055;
    sign.rotation.y = Math.PI;
  }
}
