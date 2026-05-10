import * as THREE from 'three';
import { assembleKitShip } from './kitAssembler';
import { loadGltf } from './gltfLoader';
import type { ShipManifest } from './manifestTypes';
import { resolveMounts } from './mountPoints';
import { addManeuverThrusters, buildShipVariant, type ShipVariantId } from './primitives';
import { type BuiltShip, emptyThrusterSet } from './types';

export interface ResolveOptions {
  variant: ShipVariantId;
  manifest?: ShipManifest | null;
}

// Resolves a ship visual in this priority:
//   1. kit-built (manifest present + all parts known) -> assembleKitShip
//   2. full GLB model (manifest.fullModel set)         -> loadGltf wrap
//   3. primitive fallback (variant id)                 -> buildShipVariant
//
// Returns Promise<BuiltShip>. Steps 1 and 3 are effectively synchronous; step 2
// awaits the network load. Failures fall through to the next option.

export async function resolveShipVisual(options: ResolveOptions): Promise<BuiltShip> {
  const { variant, manifest } = options;

  if (manifest && manifest.parts.length > 0) {
    try {
      return assembleKitShip(manifest);
    } catch (err) {
      console.warn('[shipVisual] kit assembly failed, falling through', err);
    }
  }

  if (manifest?.fullModel) {
    try {
      return await wrapFullModel(manifest);
    } catch (err) {
      console.warn('[shipVisual] full-model load failed, falling through', err);
    }
  }

  return buildShipVariant(variant);
}

async function wrapFullModel(manifest: ShipManifest): Promise<BuiltShip> {
  if (!manifest.fullModel) throw new Error('no fullModel');
  const root = new THREE.Group();
  const gltfRoot = await loadGltf(manifest.fullModel);
  root.add(gltfRoot);

  const thrusters = emptyThrusterSet();
  addManeuverThrusters(root, thrusters);

  const attachments = resolveMounts(root, gltfRoot, manifest.mounts);
  return { root, attachments, thrusters };
}
