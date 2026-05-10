import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Scene + renderer + lights + starfield + camera. No game state.

export interface RenderRig {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  // Background container (dome + stars). Each frame `skybox.position` should
  // be copied from the camera so they read as infinitely far rather than as
  // the boundary of a finite sphere.
  skybox: THREE.Group;
}

export function createRenderRig(canvas: HTMLCanvasElement): RenderRig {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03060d);
  scene.fog = new THREE.FogExp2(0x07111c, 0.000075);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    20000,
  );

  const skybox = new THREE.Group();
  skybox.add(buildNebulaDome(9200));
  scene.add(skybox);

  const key = new THREE.DirectionalLight(0xffb16a, 3.1);
  key.position.set(-0.72, 0.34, 0.58).multiplyScalar(4000);
  scene.add(key);

  const blueRim = new THREE.DirectionalLight(0x4cc9ff, 1.8);
  blueRim.position.set(0.54, 0.22, -0.78).multiplyScalar(4000);
  scene.add(blueRim);

  const violetKicker = new THREE.DirectionalLight(0x9a6cff, 0.9);
  violetKicker.position.set(-0.15, -0.58, -0.42).multiplyScalar(4000);
  scene.add(violetKicker);

  scene.add(new THREE.HemisphereLight(0x315d74, 0x160d0a, 0.58));

  skybox.add(buildStarfield(3400, 8800));

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55,
    0.45,
    0.78,
  ));
  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return { renderer, composer, scene, camera, skybox };
}

function buildNebulaDome(radius: number): THREE.Mesh {
  const geom = new THREE.SphereGeometry(radius, 48, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x071b33) },
      mid: { value: new THREE.Color(0x0c4d58) },
      low: { value: new THREE.Color(0x351444) },
      ember: { value: new THREE.Color(0xff8a3a) },
      sunColor: { value: new THREE.Color(0xffd49a) },
      sunDir: { value: new THREE.Vector3(-0.72, 0.34, 0.58).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 mid;
      uniform vec3 low;
      uniform vec3 ember;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      varying vec3 vDir;

      float band(vec3 dir, vec3 normal, float width) {
        return pow(max(0.0, 1.0 - abs(dot(dir, normal)) / width), 2.0);
      }

      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(low, top, h);
        col = mix(col, mid, band(vDir, normalize(vec3(0.55, 0.18, 0.82)), 0.32) * 0.62);
        col += ember * band(vDir, normalize(vec3(-0.74, 0.12, 0.35)), 0.18) * 0.45;
        float sun = max(0.0, dot(vDir, sunDir));
        col += sunColor * pow(sun, 520.0) * 5.2;
        col += sunColor * pow(sun, 24.0) * 0.55;
        col += vec3(1.0, 0.32, 0.12) * pow(sun, 8.0) * 0.12;
        col *= 0.42 + 0.28 * smoothstep(-0.15, 0.8, vDir.y);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geom, mat);
  dome.renderOrder = -10;
  return dome;
}

// Uniform points-on-sphere via Marsaglia. Pure visual reference for rotation.
export function buildStarfield(count: number, radius: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const warm = new THREE.Color(0xffe3bd);
  const cool = new THREE.Color(0x9ad8ff);
  const violet = new THREE.Color(0xc7a5ff);
  const color = new THREE.Color();
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

    color.copy(Math.random() > 0.82 ? cool : warm);
    if (Math.random() > 0.96) color.copy(violet);
    color.multiplyScalar(0.72 + Math.random() * 0.7);
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    size: 1.7,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Points(geom, mat);
}
