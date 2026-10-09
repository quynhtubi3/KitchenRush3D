export function renderResolution(
  width: number,
  height: number,
  dpr: number,
  quality: string,
  sharpness = 'auto',
) {
  const ratio = Number.isFinite(dpr) ? Math.max(1, dpr) : 1;
  const cap =
    sharpness === 'native'
      ? 3
      : sharpness === 'css'
        ? 1
        : quality === 'high'
          ? 3
          : quality === 'low'
            ? 1.5
            : 2;
  const pixels = quality === 'high' ? 6_000_000 : 3_000_000;
  const scale = Math.max(1, Math.min(ratio, cap, Math.sqrt(pixels / Math.max(1, width * height))));
  return {
    scale,
    hardwareScalingLevel: 1 / scale,
    width: Math.floor(Math.max(1, width) * scale),
    height: Math.floor(Math.max(1, height) * scale),
  };
}
