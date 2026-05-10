// Field zone helper. Distance-from-base heuristic; deep field is the
// money/risk pocket per vision §"The World".

export type FieldZone = 'open' | 'mid' | 'deep';

export const ZONE_TUNING = {
  OPEN_RADIUS: 1200,
  DEEP_RADIUS: 3000,
};

export function zoneFor(distanceFromBase: number): FieldZone {
  if (distanceFromBase <= ZONE_TUNING.OPEN_RADIUS) return 'open';
  if (distanceFromBase <= ZONE_TUNING.DEEP_RADIUS) return 'mid';
  return 'deep';
}

export function zoneLabel(z: FieldZone): string {
  switch (z) {
    case 'open': return 'OPEN SPACE';
    case 'mid': return 'MID FIELD';
    case 'deep': return 'DEEP FIELD';
  }
}
