# 2026-06-07 2156 - Recovery cleanup

## What was done

- Removed inactive legacy gameplay systems from the active source tree: mining/economy/cargo, hangar/upgrades, pickups, combat/weapons/enemies, zones, persistence, reticle, hangar UI, Friend Heat, and ship-builder support.
- Removed tracked draft ship binaries from `public/ships/`.
- Simplified the active course board to Start Race and Settings.
- Rebuilt `src/debug/tuningPanel.ts` as a racing-only panel.
- Trimmed `ShipCommand`, collision groups, contact kinds, and ship collision filters to the active racing loop.
- Changed asteroid field construction/regeneration to use the active `RaceCourse`.
- Added start/gate clearance rejection for real procedural asteroids.
- Added start/gate/route-corridor rejection plus dimmer opacity for visual-only instanced asteroids.
- Removed unused visual-hazard tuning fields from course defaults and course overrides.
- Appended a durable cleanup decision to `docs/decisions.md`.
- Rewrote `docs/state.md` to match the cleaned fork state.

## What worked

- `npm.cmd run build` passed.
- TypeScript accepted the reduced active source surface.
- Vite produced a production build with the existing large chunk warning only.

## What didn't and why

- Browser/controller playtest was not run in this session.
- Some inactive CSS selectors for removed Friend Heat, field-notes, and invalid scenes remain in `src/main.ts`; they are not active code but should be trimmed later.
- `apply_patch` could not delete binary ship files because they are not UTF-8, so those specific files were removed with PowerShell literal paths after verifying they were inside the workspace.

## Decisions made

- `docs/decisions.md` now records that this branch is a focused asteroid time-trial racing fork and removes inactive prototype systems from the active path.

## Left unfinished

- Browser smoke test and controller playtest.
- Visual verification that near-route rocks are real obstacles and visual-only rocks stay background.
- Remove stale Friend Heat/field-notes/invalid CSS.
- Update Supabase SQL/docs to remove Friend Heat table guidance if shared leaderboards remain.
- Add richer debug overlays for collider spheres, route corridor volume, and real-vs-visual counts.

## state.md updated

yes
