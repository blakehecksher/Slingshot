status: active

# Plan — Slingshot feel pass

_Created: 2026-05-09 1921_

## Goal

Restore the slingshot feel that the spec promises in `docs/spec/slingshot-story-spec.md`. Right now flying past a rock feels like brake-by-gravity. Pilot should feel: distant tug = ignorable, mid-range = bend, close = real fling, too close = capture / point of no return.

## Diagnosis

1. **Speed-assist damps the slingshot.** `SHIP_TUNING.SPEED_ASSIST_DAMPING=0.85` opposes velocity unconditionally above `SPEED_ASSIST_START=95 m/s`. Gravity speeds ship up on approach → assist immediately bleeds it back off. Net flyby = brake.
2. **Gravity well too soft, too wide.** `SOFTENING_FACTOR=0.7`, `MIN_SOFTENING=28`, `G=0.02` cap the near-field pull and stretch the well. Big rock peak surface pull only ~12 m/s². No "snap" near the surface, just a wide gentle drag.
3. **Mass scales radius².** Spec says size correlates with concentrated Dead Iron core → gravity should scale super-linearly. Currently 2x radius = 4x mass. Want closer to 8x.
4. **No core / point-of-no-return curve.** Pull is monotonic Newton — no extra danger zone near the surface, so the spec's "Dead Iron core" capture moment doesn't exist mechanically.

## Steps

1. `src/game/gravity.ts`
   - `G: 0.02 → 0.05`
   - `SOFTENING_FACTOR: 0.7 → 0.35`
   - `MIN_SOFTENING: 28 → 12`
   - Add `CORE_BOOST_RANGE_FRAC: 1.5` and `CORE_BOOST_PEAK: 1.8`. When `clearance < radius * RANGE_FRAC`, multiply pull by `1 + t² * PEAK` where `t = 1 - clearance/(radius*RANGE_FRAC)`. This is the Dead Iron core ramp.
2. `src/game/asteroids.ts`
   - `MASS_COEF: 900 → 8`
   - Add `MASS_RADIUS_POWER: 3` (mass = radius^P × COEF × coreDensity)
   - Add per-asteroid `coreDensity` baked from seed (0.55–1.75). Some rocks read normal but pull harder than expected.
3. `src/game/ship.ts`
   - `SPEED_ASSIST_DAMPING: 0.85 → 0.25`
   - Add `SPEED_ASSIST_PULL_SUPPRESS_LO: 1.0`, `SPEED_ASSIST_PULL_SUPPRESS_HI: 8.0`
   - Add `setAmbientPull(p)` setter. Overspeed term (NOT brake term) scales by `1 - smoothstep(LO, HI, ambientPull)`, so assist fades out inside a real well. Pilot brake still works.
4. `src/main.ts`
   - Each physics tick: `ship.setAmbientPull(gravitySample.strongestPull)` before `applyCommand`.
5. `src/debug/tuningPanel.ts`
   - Add controls: `CORE_BOOST_RANGE_FRAC`, `CORE_BOOST_PEAK`, `MASS_RADIUS_POWER`, `CORE_DENSITY_MIN`, `CORE_DENSITY_RANGE`, `SPEED_ASSIST_PULL_SUPPRESS_LO/HI`.
   - Update `MASS_COEF` slider range (50..5000 → 1..50).
6. `docs/state.md` — note Phase 2.5 feel pass; new defaults baked.

## Notes

- Numbers chosen so radius-150 surface pull ≈ 43 m/s² (was 12), at 1 radius out ≈ 12 m/s² (was 4), at 1000m ≈ 1 m/s² (was ~1). Far-field unchanged, near-field 3-4× stronger, with up to 2.8× extra near surface from core ramp.
- `coreDensity` comes from existing `seededNoise`, so the same seed reproduces. Regen via panel still works.
- Death threshold stays 14 m/s — pilot still has to manage capture by flying out, not by smashing through.
