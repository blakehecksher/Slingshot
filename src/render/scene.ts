import * as THREE from 'three';

// Scene + renderer + lights + starfield + camera. No game state.

export interface RenderRig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

export function createRenderRig(canvas: HTMLCanvasElement): RenderRig {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    20000,
  );

  // Warm, low-angle key light to read off ship surfaces; cool ambient fill so
  // shadowed faces aren't pure black. Tweak when art direction matures.
  const sun = new THREE.DirectionalLight(0xffe6b3, 1.4);
  sun.position.set(50, 30, 20);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x2a3548, 0.45));

  scene.add(buildStarfield(2500, 9000));

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return { renderer, scene, camera };
}

// Uniform points-on-sphere via Marsaglia. Pure visual reference for rotation.
export function buildStarfield(count: number, radius: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let x1 = 0, x2 = 0, s = 2;
    while (s >= 1) {
      x1 = Math.random() * 2 - 1;
      x2 = Math.random() * 2 - 1;
      s = x1 * x1 + x2 * x2;
    }
    const factor = 2 * Math.sqrt(1 - s);
    positions[i * 3 + 0] = x1 * factor * radius;
    positions[i * 3 + 1] = x2 * factor * radius;
    positions[i * 3 + 2] = (1 - 2 * s) * radius;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xeae0c8,
    size: 1.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
  });
  return new THREE.Points(geom, mat);
}
