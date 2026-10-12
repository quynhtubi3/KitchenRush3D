export type ProjectedStation = { id: string; x: number; y: number };

export const TOUCH_STATION_RADIUS = 40;

/**
 * Resolves a finger tap to the closest projected station surface. This is a
 * forgiving input hit test only; the server still validates the interaction.
 */
export function pickTouchStation(
  x: number,
  y: number,
  stations: readonly ProjectedStation[],
  radius = TOUCH_STATION_RADIUS,
): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0)
    return null;

  let selected: string | null = null;
  let nearestDistance = radius * radius;
  for (const station of stations) {
    if (!Number.isFinite(station.x) || !Number.isFinite(station.y)) continue;
    const dx = station.x - x;
    const dy = station.y - y;
    const distance = dx * dx + dy * dy;
    if (
      distance <= nearestDistance &&
      (selected === null ||
        distance < nearestDistance ||
        (distance === nearestDistance && station.id.localeCompare(selected) < 0))
    ) {
      selected = station.id;
      nearestDistance = distance;
    }
  }
  return selected;
}
