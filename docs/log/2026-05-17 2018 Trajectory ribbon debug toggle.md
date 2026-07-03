# 2026-05-17 2018 - Trajectory ribbon debug toggle

## What was done

- Hid the world-space trajectory ribbon by default.
- Added a `TrajectoryRibbon.setVisible()` debug control.
- Routed the existing `O`/`H` debug/info panel toggle through one helper so the controls panel, HUD panel, pad debug, and trajectory ribbon stay synchronized.
- Left trajectory prediction active for the minimap.
- Ran `npm run build`.

## What worked

- Build completed successfully.
- The existing Vite chunk-size warning remains unchanged.

## What didn't and why

- Browser visual verification was not run in this chunk.

## Decisions made

none

## Left unfinished

- Quick browser check that `O`/`H` shows the ribbon with the panels and hides it again during normal play.

## state.md updated: yes
