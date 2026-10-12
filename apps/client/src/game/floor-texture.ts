/** Authored ceramic/stone/panel layouts. One baked texture per room, no tile meshes. */
const floors = {
  'little-sun': { a: [205, 104, 76], b: [250, 234, 204], grout: [115, 78, 61], w: 1.8, h: 1.8 },
  tide: { a: [39, 90, 122], b: [48, 113, 139], grout: [25, 60, 80], w: 1.9, h: 1.8 },
  olive: { a: [173, 101, 70], b: [215, 189, 145], grout: [110, 81, 60], w: 2.1, h: 1.65 },
  lantern: { a: [95, 70, 60], b: [125, 80, 64], grout: [50, 43, 42], w: 2.35, h: 1.25 },
  orbit: { a: [81, 80, 125], b: [98, 101, 145], grout: [40, 40, 70], w: 2.6, h: 2.2 },
} as const;

export function floorPixels(id: string, size = 256): Uint8Array {
  const p = new Uint8Array(size * size * 4);
  const f = floors[id as keyof typeof floors] ?? floors['little-sun'];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const wx = (x / size) * 15,
        wz = (y / size) * 11;
      const row = Math.floor(wz / f.h);
      const offset =
        id === 'lantern' ? ((row % 2) * f.w) / 2 : id === 'olive' ? (row % 3) * 0.7 : 0;
      const u = (wx + offset) / f.w,
        v = wz / f.h;
      const col = Math.floor(u),
        fu = u - col,
        fv = v - row;
      const edge = Math.min(fu * f.w, (1 - fu) * f.w, fv * f.h, (1 - fv) * f.h);
      const seam = edge < 0.025;
      const seed = ((col * 17 + row * 29 + 61) % 13) - 6;
      const alternate =
        id === 'little-sun'
          ? (col + row) % 2
          : id === 'olive'
            ? (col + row * 3) % 5 === 0
            : (col + row) % 3 === 0;
      const base = seam ? f.grout : alternate ? f.b : f.a;
      // Broad satin glaze + a narrow bevel. No high-frequency terrazzo/noise.
      const bevel = !seam && edge < 0.075 ? (fu + fv < 1 ? 12 : -9) : 0;
      const glaze = id === 'tide' ? Math.sin(fu * Math.PI) * Math.sin(fv * Math.PI) * 5 : 0;
      let accent: readonly number[] | undefined;
      const perimeter = wx < 0.55 || wx > 14.45 || wz < 0.55 || wz > 10.45;
      if (id === 'tide' && perimeter && Math.abs(fv - 0.5 - Math.sin(wx * 2.2) * 0.14) < 0.035)
        accent = [129, 187, 191];
      if (id === 'olive' && perimeter)
        accent = (Math.floor(wx * 3) + Math.floor(wz * 3)) % 3 ? [170, 157, 106] : [90, 113, 70];
      if (id === 'orbit' && !seam) {
        if (fu > 0.14 && fu < 0.3 && fv > 0.12 && fv < 0.16) accent = [49, 52, 80];
        if (perimeter && (col + row) % 3 === 0 && fu > 0.4 && fu < 0.72 && fv > 0.36 && fv < 0.45)
          accent = [188, 177, 90];
      }
      if (id === 'lantern' && perimeter && !seam) accent = [111, 86, 70];
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++)
        p[i + c] = Math.max(
          0,
          Math.min(255, accent ? accent[c] : base[c] + (seam ? 0 : seed * 0.7 + bevel + glaze)),
        );
      p[i + 3] = 255;
    }
  return p;
}
