# 2026-05-17 2243 - Start Screen Redesign

## What was done

- Replaced the title/course entry screens with a shared Amber Iron claim-board layout based on `docs/spec/concept-images/Slingshot - Browser Based Space Racing Game/handoff_title_screen/`.
- Added `public/slingshot-logo.svg` from `docs/spec/concept-images/logo/Slingshot.svg` and used it as the start-screen logo mask.
- Wired the start screen to existing course selection, callsign persistence, leaderboard rows, personal best display, records, settings, and direct race launch.
- Ran `npm run build`.
- Started Vite and HTTP-checked `http://127.0.0.1:5173/Slingshot/` plus `/Slingshot/slingshot-logo.svg`.

## What worked

- TypeScript and Vite build completed successfully.
- The local app route and logo asset returned HTTP 200.
- Existing records/settings/results scenes remain routed through the current DOM overlay system.

## What didn't and why

- In-app Browser automation could not be used because the required Node REPL browser-control tool was not exposed in this session.
- No automated visual screenshot pass was completed.

## Decisions made

none

## Left unfinished

- Manual visual inspection at desktop and mobile widths.
- Manual controller playtest of the redesigned start screen and menu focus behavior.

## state.md updated: yes
