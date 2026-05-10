// Ship visual manifest types. Shape mirrors docs/spec/ship-asset-pipeline.md.
// Used by the resolver, GLTF loader, kit assembler, and ship-builder UI.

export type AttachmentName =
  | 'nose'
  | 'wing-l'
  | 'wing-r'
  | 'engine-l'
  | 'engine-r'
  | 'topspine'
  | 'cargo-bay'
  | 'weapon-l'
  | 'weapon-r';

export const ATTACHMENT_NAMES: readonly AttachmentName[] = [
  'nose',
  'wing-l',
  'wing-r',
  'engine-l',
  'engine-r',
  'topspine',
  'cargo-bay',
  'weapon-l',
  'weapon-r',
];

export type PartSlot =
  | 'hull'
  | 'cockpit'
  | 'engine-l'
  | 'engine-r'
  | 'wing-l'
  | 'wing-r'
  | 'topspine'
  | 'cargo-bay'
  | 'weapon-l'
  | 'weapon-r';

export const PART_SLOTS: readonly PartSlot[] = [
  'hull',
  'cockpit',
  'engine-l',
  'engine-r',
  'wing-l',
  'wing-r',
  'topspine',
  'cargo-bay',
  'weapon-l',
  'weapon-r',
];

export interface ShipPart {
  // Slot the part fills. The slot also determines its mount point.
  slot: PartSlot;
  // Built-in id (resolved against builtinParts.ts). When loading GLB-based
  // parts later, this can become a path; for V1 only built-ins exist.
  partId: string;
}

export interface ShipManifest {
  id: string;
  displayName: string;
  fallbackPrimitive?: string;
  fullModel?: string;
  // Either an inline list of parts (kit-built) or empty (force fallback).
  parts: ShipPart[];
  // Optional manifest-level mount overrides. If omitted, defaults from the
  // primitive layout are used.
  mounts?: Partial<Record<AttachmentName, [number, number, number]>>;
}
