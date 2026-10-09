/** Original deterministic floor textures in RGBA; no network assets or canvas dependency. */
export function floorPixels(id: string, size = 256): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const colors: Record<string, number[]> = {
    tide: [197, 166, 122],
    olive: [186, 115, 83],
    lantern: [141, 121, 102],
    orbit: [110, 127, 148],
  };
  const base = colors[id] ?? colors.tide;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const wx = (x / size) * 15,
        wz = (y / size) * 11;
      const row = Math.floor(wz / (id === 'tide' ? 0.55 : id === 'orbit' ? 1.1 : 0.75));
      const width = id === 'tide' ? 3 : id === 'orbit' ? 1.5 : id === 'lantern' ? 1.4 : 0.75;
      const u = (wx + (id === 'olive' ? 0 : ((row % 2) * width) / 2)) / width;
      const v = wz / (id === 'tide' ? 0.55 : id === 'orbit' ? 1.1 : 0.75);
      const fu = u - Math.floor(u),
        fv = v - Math.floor(v);
      const grout = fu < 0.024 || fv < 0.035;
      const noise = ((x * 13 + y * 17 + x * y) % 11) - 5;
      const tile = ((Math.floor(u) * 7 + row * 11) % 7) - 3;
      const grain = id === 'tide' ? Math.sin(wz * 110 + Math.sin(wx * 1.7) * 2) * 3 : noise * 0.38;
      const offset = grout ? -23 : tile * 2 + grain;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.max(0, Math.min(255, base[c] + offset));
      if (
        id === 'orbit' &&
        fv < 0.025 &&
        fu > 0.08 &&
        fu < 0.3 &&
        (row + Math.floor(u)) % 3 === 0
      ) {
        pixels[i] = 113;
        pixels[i + 1] = 205;
        pixels[i + 2] = 200;
      }
      if (
        id === 'olive' &&
        (Math.floor(u) + row * 3) % 13 === 0 &&
        fu > 0.25 &&
        fu < 0.75 &&
        fv > 0.25 &&
        fv < 0.75
      ) {
        pixels[i] = 120;
        pixels[i + 1] = 145;
        pixels[i + 2] = 117;
      }
      pixels[i + 3] = 255;
    }
  return pixels;
}
