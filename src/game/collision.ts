// Collision-group bitfield + contact registry.

import type { Asteroid } from './asteroids';

export const COL_SHIP       = 1 << 0;
export const COL_ASTEROID   = 1 << 1;
export const COL_PICKUP     = 1 << 2;
export const COL_BASE       = 1 << 3;
export const COL_PROJECTILE = 1 << 4;
export const COL_ENEMY      = 1 << 5;

export function interactionGroups(membership: number, filter: number): number {
  return (membership << 16) | (filter & 0xffff);
}

export type ContactKind =
  | { type: 'asteroid'; asteroid: Asteroid }
  | { type: 'pickup-energy'; id: number }
  | { type: 'pickup-cargo'; id: number }
  | { type: 'base' }
  | { type: 'projectile'; id: number; ownerKind: 'player' | 'enemy' }
  | { type: 'enemy'; id: number };

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
