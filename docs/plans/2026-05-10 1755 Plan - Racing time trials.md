status: complete

# Plan - Racing Time Trials
_Created: 2026-05-10 1755_

## Goal

Create branch `racing-time-trials` and turn Slingshot into an ordered checkpoint time-trial game focused on fast gravity navigation.

## Steps

1. Create the `racing-time-trials` branch from clean `main`.
2. Add deterministic race courses with fixed start positions, checkpoint gates, finish gates, medal times, and per-course asteroid tuning.
3. Add race runtime state: course select, countdown, racing, finished, invalid, fixed-step timer, ordered checkpoint validation, restart/reset.
4. Add local-first leaderboard persistence under `localStorage["slingshot.racing.save.v1"]`.
5. Add transform-sampled personal-best ghosts and translucent hologram playback.
6. Replace the active game loop HUD with race timer, checkpoint progress, split deltas, best time, speed, pull, clearance, and restart/course controls.
7. Keep mining, combat, hangar, and upgrade systems in the repo but inactive in the racing branch entrypoint.
8. Build-check and update docs/session state.

## Notes

- First version uses ordered circuits, not any-order rally.
- First version uses local personal bests only. Supabase is represented by an adapter stub for later backend wiring.
- Race courses reset asteroid generation by seed so a course is comparable across restarts.
