const customerHair = ['#704735', '#3e5050', '#ad6847', '#5b496b'] as const;

/** Stable client-side styling: the same server customer looks the same to every teammate. */
export function customerAppearance(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seed = hash >>> 0;
  return {
    variant: seed % customerHair.length,
    hair: customerHair[seed % customerHair.length],
    blinkOffset: (seed % 43) / 10,
  };
}

export function blinkAmount(time: number, offset: number, reducedMotion: boolean) {
  if (reducedMotion) return 0;
  const phase = (((time + offset) % 4.7) + 4.7) % 4.7;
  return Math.max(0, 1 - Math.abs(phase - 0.085) / 0.085);
}
