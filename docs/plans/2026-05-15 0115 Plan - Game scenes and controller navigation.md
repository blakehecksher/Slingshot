status: complete

# Plan - Game Scenes And Controller Navigation
_Created: 2026-05-15 0115_

## Goal

Create a first working pass of the required time-trial game scenes from the product outline, using the Dead Iron working-field aesthetic and main-screen wireframes, with Xbox controller navigation through the overall loop.

## Steps
1. Extend input with menu navigation and pause/back/confirm controller events.
2. Add an app-level scene state for title, course board, pre-race setup, race, pause, invalid, results, records, and settings.
3. Rework the overlay UI into claim-board/timing-terminal screens while keeping the live race field behind menus.
4. Add basic settings controls and ghost target display/selection shell.
5. Build-check and inspect the running app.

## Notes

This is a broad playable slice, not final screen polish. The existing physics, courses, ghosts, leaderboard provider, and race manager remain the base systems.

Completed with build verification. Manual visual/controller inspection is still recommended because the in-app browser automation surface was unavailable in this session.
