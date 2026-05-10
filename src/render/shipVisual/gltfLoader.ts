import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Cached GLTF loader. Used by the future kit-with-GLB-parts path and by the
// full-model fallback. Returns the parsed scene's Object3D root, cloned so
// callers can freely add to scenes without conflicts.

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

export function loadGltf(url: string): Promise<THREE.Object3D> {
  let entry = cache.get(url);
  if (!entry) {
    entry = new Promise<THREE.Object3D>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => reject(err),
      );
    });
    cache.set(url, entry);
  }
  return entry.then((scene) => scene.clone(true));
}

export function clearGltfCache(): void {
  cache.clear();
}
