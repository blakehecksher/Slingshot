# 2026-05-09 2136 - Browser thrust and creak pass

## What was done

- Used Playwright against the local Vite app to capture idle, forward, boost, reverse, and strafe visual states.
- Fixed boost plume clipping by anchoring plume cone geometry at the nozzle base so boost scaling extends outward.
- Added gamepad X as an edge-triggered ship visual cycle input, matching keyboard V.
- Changed hull creak from clearance-only to clearance plus gravity-pull gated, with new tuning controls for pull thresholds.

## What worked

- `npm.cmd run build` passes.
- Playwright screenshot pass confirmed the boost plume no longer grows backward through the hull.

## What didn't and why

- No live gamepad hardware test was run; the X mapping was implemented against the standard Gamepad API button index.

## Decisions made

none

## Left unfinished

- Tune final creak pull thresholds in a live feel pass if it becomes too quiet near medium wells.

## state.md updated: yes
