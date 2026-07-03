# Plan — Slingshot Visual Overhaul

2026-06-17. Goal: lift the look from "Three.js demo" to "a game" without new 3D
art. All-code: IBL, post-FX, shaders, sprites, particles. No GLB authoring.

## Baseline (what already exists)

- `scene.ts`: WebGLRenderer (antialias), ACES tonemap @1.16, `EffectComposer`
  with RenderPass + UnrealBloomPass(0.55) + OutputPass. Nebula-dome shader,
  starfield Points, 3 directional lights + hemi.
- Ships: procedural primitives, `MeshStandardMaterial`, no scene `environment`.
- `dust.ts` parallax cloud. `courseGuideLine.ts` static line. `checkpoints.ts`
  additive torus gates w/ pulse. Asteroids icosahedron + MeshStandard.
- `graphicsQuality` setting exists but is **never wired to the renderer**.

## Workstreams

1. **IBL env map** — `src/render/environment.ts`. PMREM-prefilter a small
   procedural gradient scene (matches dome palette: warm key, teal/violet
   ambient). Assign `scene.environment`. Instantly gives metals reflections.

2. **Post-FX** — `src/render/postfx.ts`. Replace inline composer. Chain:
   RenderPass → UnrealBloom → SMAAPass → **GradePass** (single fragment shader:
   chromatic aberration + vignette + film grain + filmic color grade/LUT-lite)
   → OutputPass. GradePass exposes uniforms driven each frame:
   `uSpeed` (0..1), `uBoost` (0..1) → CA + vignette intensity ramp = speed feel.
   Quality tiers toggle bloom/SMAA/grain cost.

3. **Speed-reactive camera** — in `main.ts` render(): lerp camera FOV
   75→~92 by speed+boost; feed `uSpeed/uBoost` to postfx.

4. **Ship materials** — `primitives.ts`: emissive accent strips, pulsing
   running lights (small emissive meshes animated in `ship.ts`/loop), fresnel
   rim via `onBeforeCompile`, brighter engine emissive core + boost color shift.

5. **Course guide line** — `courseGuideLine.ts`: ShaderMaterial with a flowing
   dash (scroll UV by time) that pulses toward the next gate; `update(dt)`.

6. **Backdrop depth** — `src/render/backdrop.ts` (or fold into scene): 2–3
   additive billboard nebula sprites at depth in the skybox group + a distant
   sun glow sprite and a planet sprite for scale anchor.

7. **Gates** — `checkpoints.ts`: add a faint additive portal disc on the active
   gate + shimmer; keep existing rings.

8. **Wire quality** — `applyUiSettings()` calls `postfx.setQuality()` and sets
   `renderer.setPixelRatio` ceiling per tier.

## Risk / scope

- Keep every effect cheap and guarded by quality tier; medium = current cost +
  grade pass. Low disables SMAA/grain, caps pixel ratio.
- No gameplay/physics changes. Pure render layer.
