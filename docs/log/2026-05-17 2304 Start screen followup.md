# 2026-05-17 2304 - Start Screen Followup

## What was done

- Removed visible Records navigation from the start screen and results actions.
- Removed the Records app route from scene routing.
- Moved Settings into the bottom-left start-screen footer next to the control hints.
- Increased start-screen typography for course rows, leaderboard rows, pilot input, section headers, and personal-best readout.
- Moved `Dead Iron Racing League` under the Slingshot logo and centered it relative to the logo.
- Re-ran `npm run build`.

## What worked

- Build completed successfully.
- Local app route still returned HTTP 200.

## What didn't and why

- Browser automation control was still unavailable, so no automated visual screenshot pass was completed.

## Decisions made

none

## Left unfinished

- Manual visual inspection at desktop and mobile widths.
- Manual controller playtest for Start/Settings footer focus behavior.

## state.md updated: yes
