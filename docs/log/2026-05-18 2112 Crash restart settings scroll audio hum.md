# 2026-05-18 2112 - Crash restart settings scroll audio hum

## What was done

- Removed the procedural fallback music drone so missing soundtrack files no longer create a constant low hum.
- Changed race crash handling to stay in the race scene, fade to black through the existing lifecycle overlay, and automatically start a fresh run at the selected course gate.
- Fixed settings menu focus scrolling by constraining the settings list to its scroll column and scrolling the selected row into view after render.
- Added held D-pad/stick repeat for menu navigation so long settings lists can be traversed quickly.
- Confirmed settings typography is using the same IBM Plex Mono terminal stack as the start/course board.
- Ran `npm run build` successfully.

## What worked

- The TypeScript/Vite production build passed.
- The crash path no longer renders the invalid/retry/course-board menu.
- Settings focus state now has a deterministic scroll-into-view step after each settings render.

## What didn't and why

- Browser automation was not available because the Browser plugin's Node REPL control tool was not exposed.
- A foreground Vite dev server reported `http://127.0.0.1:5175/Slingshot/`, but the command timeout ended that process, so no persistent manual-test server was left running.

## Decisions made

none

## Left unfinished

- Manual browser/controller/audio review remains needed, especially crash fade timing, held D-pad feel, settings scroll behavior, and confirming the hum is gone on speakers/headphones.

## state.md updated: yes
