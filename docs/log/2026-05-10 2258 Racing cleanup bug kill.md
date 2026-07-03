# 2026-05-10 2258 - Racing cleanup bug kill

## What was done

- Simplified the course select screen to courses plus a fixed-height top-10 leaderboard.
- Removed visible local/Supabase setup language, ghost-target copy, medal targets, split chips, and command footer from the start screen.
- Kept pilot name as an editable input and kept leaderboard-backed runs as the multiplayer identity flow.
- Made Supabase top row authoritative for public leaderboard records/ghosts when remote rows are available.
- Added a large 3-2-1-GO countdown overlay.
- Hid HUD/control/debug panels by default; `O` toggles panels and `P` still toggles tuning.
- Remapped gamepad controls so LB boosts and holding RB turns right-stick X into lateral strafe.
- Set RT/LT to full forward/reverse thrust, strafe to 75% of forward thrust, and boost to multiply all thrust axes.
- Added rotation maneuver plumes for pitch, yaw, and roll.
- Replaced checkpoint colors with green required gate, amber upcoming gates, and faint neutral passed gates.
- Added density-driven dead-iron asteroid visuals with darker material, stronger glints, and red-orange rings/fissures.
- Silenced gravity rumble/creak when not actively racing and on reset/wreck/finish.
- Offset the trajectory ribbon start ahead of the ship nose to reduce cockpit jitter/noise.
- Ran `npm run build` successfully.
- Started local dev server at `http://127.0.0.1:5173/`.

## What worked

- TypeScript and Vite production build pass.
- Dev server responded with HTTP 200.

## What didn't and why

- First build failed because the old `fasterRecord` helper became unused after Supabase top-row ghost behavior changed. Removed it.
- Existing large bundle warning remains from Three/Rapier.

## Decisions made

none

## Left unfinished

- Hands-on controller playtest for LB boost and RB strafe mode.
- Browser run completion to verify Supabase insert/refresh and top-run ghost replay.
- In-motion tuning of new gate colors, dead-iron asteroid readability, and rotation thruster placement.

## state.md updated: yes
