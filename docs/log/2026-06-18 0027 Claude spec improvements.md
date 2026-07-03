# 2026-06-18 0027 - Claude spec improvements

## What was done

- Promoted the reverse-engineered specification to `docs/spec/spec.md`.
- Added fresh-countdown versus thrust-to-launch retry behavior.
- Added ordinary, weak Dead Iron, and strong Dead Iron asteroid gravity classes with distinct visuals.
- Added automatic pause on tab hiding and controller disconnect.
- Added warned course-envelope loss that resets the full attempt.
- Added strong-well visual treatment, release whoosh, and HOT PASS speed-gain feedback.
- Added tuning controls and debug counts for asteroid gravity classes.

## What worked

- `npm.cmd run build` passes.
- `git diff --check` passes.
- Playwright smoke test passed for launch, countdown, manual retry, ready state, and timer start on thrust.
- Screenshot review confirmed the ready-state overlay and live race HUD preserve the playfield.
- Browser test reported no page or console errors.

## What didn't and why

- The in-app Browser connection was unavailable, so rendered verification used temporary Playwright tooling.
- Headless WebGL advances the fixed-step countdown slowly; the test verifies the countdown, then triggers retry directly.
- Controller-specific feel and haptics cannot be validated through headless automation.

## Decisions made

- Fresh launches keep the countdown; subsequent attempts launch on thrust.
- Ranked runs remain clean start-to-finish attempts.
- Gameplay asteroids use ordinary, weak, and strong gravity classes.
- Focus/input loss pauses; course loss resets the whole attempt.
- Strong-well speed gains receive distinct release feedback.

## Left unfinished

- Hands-on controller tuning for class ratios, weak pull, course envelope, haptics, and HOT PASS thresholds.
- Broader finish/results/remote leaderboard controller pass.

## state.md updated

yes
