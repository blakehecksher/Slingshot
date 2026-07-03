# 2026-05-18 2124 - Results and setup scene simplification

## What was done

- Removed the separate `setup` app scene from the active scene union, input routing, rendering, click wiring, and related styles.
- Removed the `Race ghosts` result action and the branch that opened the setup screen.
- Simplified results to two actions: `Retry` and `Title board`.
- Replaced the results `Ghosts` metric with personal-best, player-board, and number-one board time comparisons plus deltas.
- Removed the visible race HUD `Ghosts` tile and renamed the settings label from `Ghost opacity` to `Rival opacity`.
- Updated the active product outline, active UI polish plan, and decisions log to reflect the simplified flow.
- Ran `npm run build` successfully.

## What worked

- Build passed after the scene removal.
- Results no longer expose a ghost-selection branch or setup screen.

## What didn't and why

- Browser automation was still unavailable in this session.
- Attempts to leave a background Vite server running through the shell did not persist, though a foreground dev run reported `http://127.0.0.1:5175/Slingshot/` before the tool timeout ended it.

## Decisions made

- Added `2026-05-18 2124 - No separate race setup or ghost results branch` to `docs/decisions.md`.

## Left unfinished

- Manual browser/controller review is still needed to confirm the revised results screen visually matches the title/course board and that the removed setup branch is unreachable.

## state.md updated: yes
