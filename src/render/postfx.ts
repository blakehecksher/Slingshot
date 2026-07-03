import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type GraphicsQuality = 'low' | 'medium' | 'high';

// The look lives here. The render pipe is:
//   RenderPass -> Bloom -> SMAA -> Grade -> Output
// "Grade" is one fragment shader doing the cinematic finishing pass:
// speed-reactive chromatic aberration, vignette, film grain, and a filmic
// colour grade. Driving its `uSpeed`/`uBoost` uniforms from the flight state is
// what makes 100 m/s *feel* like 100 m/s — the frame itself reacts to velocity.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uBoost: { value: 0 },
    uWell: { value: 0 },
    uSling: { value: 0 },
    uGrain: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uSpeed;
    uniform float uBoost;
    uniform float uWell;
    uniform float uSling;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      vec2 toCenter = uv - 0.5;
      float r2 = dot(toCenter, toCenter);

      // --- Chromatic aberration: zero at centre, ramps to the edges, and
      // scales hard with speed + boost so the whole frame smears at the rim.
      float ca = (0.0016 + uSpeed * 0.004 + uBoost * 0.006 + uSling * 0.009) * r2 * 4.0;
      vec2 dir = normalize(toCenter + 1e-5);
      vec3 col;
      col.r = texture2D(tDiffuse, uv - dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + dir * ca).b;

      // --- Filmic colour grade: lift shadows toward indigo, push highlights
      // warm, then a gentle contrast S-curve and saturation lift. This is the
      // single "signature LUT" that unifies every frame.
      vec3 shadowTint = vec3(0.04, 0.05, 0.09);
      vec3 highTint = vec3(1.05, 0.98, 0.88);
      col = mix(col + shadowTint * (1.0 - col), col * highTint, smoothstep(0.2, 0.9, dot(col, vec3(0.33))));
      col = (col - 0.5) * 1.08 + 0.5;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.14);
      col = mix(col, col * vec3(0.72, 0.94, 1.04) + vec3(0.0, 0.025, 0.035), uWell * r2 * 0.8);
      col += vec3(0.22, 0.75, 0.78) * uSling * smoothstep(0.32, 0.78, length(toCenter)) * 0.12;

      // --- Vignette: tightens with speed to funnel the eye down the line.
      float vig = smoothstep(0.9, 0.25, r2 * (1.0 + uSpeed * 0.8 + uBoost * 0.6 + uWell * 0.45));
      col *= mix(1.0, vig, 0.55 + uSpeed * 0.2);

      // --- Film grain: kills banding in the dark nebula gradients.
      float g = hash(uv * uResolution + uTime * 60.0) - 0.5;
      col += g * 0.035 * uGrain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export interface PostFx {
  composer: EffectComposer;
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Per-frame: speed/boost in 0..1, dt seconds for grain animation. */
  setDynamics(speed01: number, boost01: number, well01: number, dt: number): void;
  triggerSlingshot(intensity: number): void;
  setQuality(quality: GraphicsQuality): void;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFx {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pixelRatio = renderer.getPixelRatio();

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(size.x, size.y);

  // Order matters: bloom is added in linear HDR, then OutputPass applies tone
  // mapping + sRGB so SMAA and the grade run in display space (where their
  // contrast/vignette/CA math is meant to live). Grade is last → to screen.
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.62, 0.5, 0.74);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const smaa = new SMAAPass(size.x * pixelRatio, size.y * pixelRatio);
  composer.addPass(smaa);

  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uResolution.value.set(size.x * pixelRatio, size.y * pixelRatio);
  composer.addPass(grade);

  let time = 0;
  let slingshotPulse = 0;

  return {
    composer,
    setSize(width, height, ratio) {
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
      bloom.setSize(width, height);
      smaa.setSize(width * ratio, height * ratio);
      grade.uniforms.uResolution.value.set(width * ratio, height * ratio);
    },
    setDynamics(speed01, boost01, well01, dt) {
      time += dt;
      slingshotPulse = Math.max(0, slingshotPulse - dt * 1.9);
      grade.uniforms.uTime.value = time;
      grade.uniforms.uSpeed.value = Math.max(0, Math.min(1, speed01));
      grade.uniforms.uBoost.value = Math.max(0, Math.min(1, boost01));
      grade.uniforms.uWell.value = Math.max(0, Math.min(1, well01));
      grade.uniforms.uSling.value = slingshotPulse;
    },
    triggerSlingshot(intensity) {
      slingshotPulse = Math.max(slingshotPulse, Math.max(0, Math.min(1, intensity)));
    },
    setQuality(quality) {
      // SMAA + grain are the discretionary cost. Bloom + grade stay on at all
      // tiers because they carry the identity of the look.
      smaa.enabled = quality !== 'low';
      grade.uniforms.uGrain.value = quality === 'low' ? 0 : 1;
      bloom.strength = quality === 'high' ? 0.72 : 0.62;
    },
  };
}
