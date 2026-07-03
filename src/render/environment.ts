import * as THREE from 'three';
import { PMREMGenerator } from 'three';

// Image-based lighting. The ship + asteroid materials are MeshStandardMaterial
// (PBR) but the scene had no `environment`, so metals rendered flat and lifeless.
// We prefilter a tiny procedural sky — matched to the nebula-dome palette — into
// an environment map. This is what makes hull metal actually read as metal:
// it gives every smooth surface something colored to reflect.

// Palette mirrors buildNebulaDome() so reflections agree with the visible sky.
const SKY_TOP = new THREE.Color(0x0a2238);
const SKY_HORIZON = new THREE.Color(0x0c4d58);
const SKY_LOW = new THREE.Color(0x351444);
const SUN_COLOR = new THREE.Color(0xffd49a);
const EMBER = new THREE.Color(0xff7a32);
const SUN_DIR = new THREE.Vector3(-0.72, 0.34, 0.58).normalize();

function buildEnvScene(): THREE.Scene {
  const scene = new THREE.Scene();

  const geom = new THREE.SphereGeometry(50, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: SKY_TOP },
      horizon: { value: SKY_HORIZON },
      low: { value: SKY_LOW },
      sunColor: { value: SUN_COLOR },
      ember: { value: EMBER },
      sunDir: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 low;
      uniform vec3 sunColor;
      uniform vec3 ember;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(low, top, h);
        col = mix(col, horizon, pow(1.0 - abs(vDir.y), 3.0) * 0.6);
        float sun = max(0.0, dot(vDir, sunDir));
        // Broad warm key the metal can catch as a highlight.
        col += sunColor * pow(sun, 12.0) * 1.6;
        col += sunColor * pow(sun, 220.0) * 4.0;
        col += ember * pow(max(0.0, dot(vDir, normalize(vec3(-0.74, 0.05, 0.35)))), 6.0) * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(geom, mat));
  return scene;
}

/** Prefilter a procedural sky into a PMREM environment texture. Call once at
 *  boot; the returned texture is owned by the caller (dispose on teardown). */
export function createEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = buildEnvScene();
  const rt = pmrem.fromScene(envScene, 0.04);
  // Free the throwaway scene's GPU resources; keep only the prefiltered map.
  envScene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose?.();
  });
  pmrem.dispose();
  return rt.texture;
}
