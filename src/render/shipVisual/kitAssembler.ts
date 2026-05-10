import * as THREE from 'three';
import { getPart } from './builtinParts';
import type { ShipManifest } from './manifestTypes';
import { addManeuverThrusters, attachPoints, createShipMaterials, finishShip } from './primitives';
import { type BuiltShip, emptyThrusterSet } from './types';

// Build a BuiltShip from a kit manifest. Each manifest entry resolves to a
// BuiltinPartDef; missing parts log + are skipped (validation lives at the
// builder UI / save-load layer). Manifests are intentionally small: one part
// per slot for V1.

export function assembleKitShip(manifest: ShipManifest): BuiltShip {
  const root = new THREE.Group();
  const thrusters = emptyThrusterSet();
  const mats = createShipMaterials();
  const ctx = { root, thrusters, mats };

  for (const entry of manifest.parts) {
    const part = getPart(entry.partId);
    if (!part) {
      console.warn('[kitAssembler] missing built-in part', entry.partId);
      continue;
    }
    if (part.slot !== entry.slot) {
      console.warn('[kitAssembler] slot mismatch', entry, '->', part.slot);
    }
    part.build(ctx);
  }

  addManeuverThrusters(root, thrusters);

  const cockpitGlow = new THREE.PointLight(0x5defff, 1.2, 8, 2.2);
  cockpitGlow.position.set(0, 0.45, -0.45);
  root.add(cockpitGlow);

  const engineGlow = new THREE.PointLight(0xff7a3a, 1.6, 9, 2.0);
  engineGlow.position.set(0, -0.08, 1.55);
  root.add(engineGlow);

  return {
    root,
    attachments: attachPoints(root, manifest.mounts),
    thrusters,
  };
}

// Helper used by hangar preview when building an arbitrary part list (no
// manifest object yet). Returns same shape as assembleKitShip.
export function assemblePartList(parts: ShipManifest['parts']): BuiltShip {
  return assembleKitShip({ id: 'preview', displayName: 'preview', parts });
}

// Re-export so callers using the assembler don't need to also import primitives.
export { finishShip };
