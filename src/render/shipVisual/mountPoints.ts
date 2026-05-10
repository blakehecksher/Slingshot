import * as THREE from 'three';
import type { AttachmentName } from './manifestTypes';
import { ATTACHMENT_NAMES, } from './manifestTypes';
import { defaultMount } from './primitives';

// Resolve a ship's attach-point Object3Ds from one of three sources, in order:
//   1. named empties found inside a parsed GLTF scene (e.g. "mount.nose"),
//   2. manifest mount overrides,
//   3. default primitive layout.
//
// Returns Object3Ds added to `root`, ready to host upgrade visuals.

export function resolveMounts(
  root: THREE.Object3D,
  fromGltf?: THREE.Object3D | null,
  manifestOverrides?: Partial<Record<AttachmentName, [number, number, number]>>,
): Record<AttachmentName, THREE.Object3D> {
  const empties = new Map<string, THREE.Object3D>();
  if (fromGltf) {
    fromGltf.traverse((node) => {
      const name = node.name?.toLowerCase();
      if (!name) return;
      if (name.startsWith('mount.')) empties.set(name.slice('mount.'.length), node);
    });
  }

  const out = {} as Record<AttachmentName, THREE.Object3D>;
  for (const name of ATTACHMENT_NAMES) {
    const empty = empties.get(name);
    if (empty) {
      out[name] = empty;
      continue;
    }
    const o = new THREE.Object3D();
    o.name = name;
    const p = manifestOverrides?.[name] ?? defaultMount(name);
    o.position.set(p[0], p[1], p[2]);
    root.add(o);
    out[name] = o;
  }
  return out;
}
