// Collision-group bitfield + contact registry.
//
// Rapier interaction groups are 32-bit: high 16 bits = membership, low 16 =
// filter. Two colliders interact iff each is in the other's filter.
//
// We use the registry to look up a typed payload from a Rapier collider
// handle when a contact / intersection event fires. This keeps the event
// dispatch in one place instead of threading per-system handle maps through
// the whole codebase.

import type { Asteroid } from './asteroids';

export const COL_SHIP     = 1 << 0;
export const COL_ASTEROID = 1 << 1;
export const COL_PICKUP   = 1 << 2;
export const COL_BASE     = 1 << 3;

export function interactionGroups(membership: number, filter: number): number {
  return (membership << 16) | (filter & 0xffff);
}

export type ContactKind =
  | { type: 'asteroid'; asteroid: Asteroid }
  | { type: 'pickup-energy'; id: number }
  | { type: 'pickup-cargo'; id: number }
  | { type: 'base' };

export class ContactRegistry {
  private map = new Map<number, ContactKind>();

  register(colliderHandle: number, kind: ContactKind): void {
    this.map.set(colliderHandle, kind);
  }

  unregister(colliderHandle: number): void {
    this.map.delete(colliderHandle);
  }

  lookup(colliderHandle: number): ContactKind | undefined {
    return this.map.get(colliderHandle);
  }
}
