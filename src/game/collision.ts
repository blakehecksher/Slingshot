// Collision-group bitfield + contact registry.

import type { Asteroid } from './asteroids';

export const COL_SHIP       = 1 << 0;
export const COL_ASTEROID   = 1 << 1;
export const COL_CHECKPOINT = 1 << 2;

export function interactionGroups(membership: number, filter: number): number {
  return (membership << 16) | (filter & 0xffff);
}

export type ContactKind =
  | { type: 'asteroid'; asteroid: Asteroid }
  | { type: 'checkpoint'; index: number };

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
