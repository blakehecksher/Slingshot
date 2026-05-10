import type { ShipManifest, ShipPart, PartSlot } from './manifestTypes';
import { PART_SLOTS } from './manifestTypes';

const VALID_SLOTS = new Set<PartSlot>(PART_SLOTS);

function isShipPart(value: unknown): value is ShipPart {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.partId === 'string' && typeof v.slot === 'string' && VALID_SLOTS.has(v.slot as PartSlot);
}

function isShipManifest(value: unknown): value is ShipManifest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string'
    && typeof v.displayName === 'string'
    && Array.isArray(v.parts)
    && (v.parts as unknown[]).every(isShipPart);
}

export async function fetchManifest(url: string): Promise<ShipManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const data = await res.json();
  if (!isShipManifest(data)) {
    throw new Error(`invalid ship manifest at ${url}`);
  }
  return data;
}

export function parseManifest(json: unknown): ShipManifest | null {
  return isShipManifest(json) ? json : null;
}
