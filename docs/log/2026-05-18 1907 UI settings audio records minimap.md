# 2026-05-18 1907 - UI settings audio records minimap

## What was done

- Added title/course-board records comparison tied to the personal-best area, with a gate-delta table and compact line graph for latest run, personal best, and leader.
- Replaced the flat minimap renderer with a 3D holographic sphere showing nearby asteroids, trajectory, next gate, finish marker, and separate top/PB ghost markers.
- Expanded settings with live-tunable ship feel, HUD, minimap, ghost opacity, camera shake, rumble, and audio levels.
- Persisted UI/settings preferences in localStorage.
- Let settings opened from pause run live over the race instead of freezing the simulation.
- Added procedural menu, boost, finish, invalid, dust-impact, thrust, boost-loop, and fallback music audio behavior.
- Added optional soundtrack loading for `public/music/menu.mp3`, `race.mp3`, and `results.mp3`, plus a README for later MP3 drops.
- Restyled the race HUD into compact terminal tiles and gave cockpit mode a stronger instrument-panel treatment.
- Build-checked with `npm run build`.

## What worked

The existing leaderboard split data and ghost positions mapped cleanly into the records comparison and minimap. The existing Web Audio class was also a good place to add procedural sounds and optional future music loops without adding dependencies.

## What didn't and why

The in-app Browser control path was not exposed in this session, and Playwright is not installed locally, so automated visual screenshots were not captured. Manual browser review is still needed.

## Decisions made

none

## Left unfinished

- Manual desktop/mobile visual inspection.
- Physical controller playtest.
- Final sound asset pass once real SFX/music files exist.
- Further polish on non-start overlays if the current consistency pass still feels too different in play.

## state.md updated: yes
