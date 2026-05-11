# 2026-05-10 1755 - Racing time trials

## What was done

- Created branch `racing-time-trials`.
- Added deterministic race course definitions, per-course asteroid tuning, ordered checkpoint gates, and fixed-step race timing.
- Added local-first leaderboard persistence at `localStorage["slingshot.racing.save.v1"]`.
- Added transform-sampled ghost recording and holographic playback.
- Replaced the active entrypoint loop with race course select, countdown, racing, finish summary, invalid/death handling, race HUD, and restart controls.
- Extended minimap markers for next checkpoint, finish, and ghost.
- Updated README, state, plan, and decisions for the racing branch.

## What worked

- `npm run build` completed successfully.
- Existing flight, gravity, ship visual, audio, trajectory, minimap, lifecycle, and tuning systems were reusable without replacing the core physics stack.

## What didn't and why

- Initial branch creation failed under sandbox permissions while creating the git ref lock; reran with escalation and branch creation succeeded.
- Browser feel test is still needed; build validation is complete, but medal times and gate placement need real runs.

## Decisions made

- Racing branch uses standardized ordered circuits.
- Race leaderboard persistence is local-first with a provider interface.
- Ghosts use fixed-interval transform samples rather than input replay.

## Left unfinished

- Browser playtest and tuning pass for all three courses.
- Supabase/shared leaderboard implementation.

## state.md updated: yes

## Follow-up fixes

- 2026-05-10 1814: Added gamepad course-screen controls, hid tuning panel by default while keeping `P` toggle, and restored ship-relative chase camera orientation.
- 2026-05-10 1821: Fixed checkpoint registration by adding `COL_CHECKPOINT` to the ship collider interaction filters.
- 2026-05-10 1835: Added Supabase-backed shared leaderboard/ghost provider, SQL setup script, and Vite env example. LocalStorage remains fallback when Supabase is not configured.
- 2026-05-10 1844: Verified Supabase read/minimal insert with the configured publishable key, surfaced remote submit errors in-game, and kept faster local ghosts from being overwritten by slower remote rows.
- 2026-05-10 1849: Fixed Supabase `Prefer: return=minimal` handling so 201 responses with empty bodies are treated as successful inserts.
