/** Size-aware tessellation for assets viewed mainly from an isometric gameplay camera. */
export function roundedBoxSegments(width: number, height: number, depth: number, radius: number) {
  const shortest = Math.max(0.001, Math.min(width, height, depth));
  if (shortest <= 0.035) return 2;
  const bevelRatio = Math.max(0, radius) / shortest;
  if (bevelRatio < 0.16) return 2;
  if (bevelRatio < 0.27) return 3;
  if (bevelRatio < 0.4) return 4;
  return 5;
}

export function sphereSegments(diameter: number) {
  return diameter < 0.085 ? 6 : diameter < 0.22 ? 8 : diameter < 0.46 ? 10 : 12;
}

export function cylinderSegments(diameter: number) {
  return diameter < 0.11 ? 8 : diameter < 0.32 ? 12 : 16;
}

export function tubeSegments(radius: number) {
  return radius < 0.012 ? 4 : radius < 0.028 ? 6 : 8;
}

export function latheSegments(profileLength: number) {
  return profileLength > 9 ? 20 : 16;
}

const roughnessLevels = [0.08, 0.28, 0.48, 0.68, 0.86, 0.96] as const;
const metallicLevels = [0, 0.18, 0.42, 0.7, 0.9] as const;

function nearestLevel(value: number, levels: readonly number[]) {
  return levels.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
  );
}

/** Keep authored PBR finishes distinct while avoiding near-duplicate material instances. */
export function materialFinish(roughness: number, metallic: number) {
  return {
    roughness: nearestLevel(roughness, roughnessLevels),
    metallic: nearestLevel(metallic, metallicLevels),
  };
}
