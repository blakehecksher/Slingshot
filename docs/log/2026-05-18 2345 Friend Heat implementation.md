# 2026-05-18 2345 - Friend Heat implementation

## What was done

- Added Supabase tables for private invite-code lobbies, participants, and heat runs (with permissive RLS) in `docs/database/supabase-racing.sql`.
- Added `src/game/racing/friendHeat.ts` with `FriendHeatClient` (create/join/leave, ready toggle, host startHeat/closeHeat, run submit, polling, lobby-best ghost selection, `canStartAttempt`, `remainingSec`).
- Wired `friend-entry`, `friend-lobby`, and `friend-results` scenes into `src/main.ts`, including a Friend Heat title/course action, invite-code display, heat countdown timer, participant list, lobby standings, and a back-to-title flow that leaves the lobby.
- Added `startHeatAttempt`/`raceIsHeatAttempt` so heat runs gate on `canStartAttempt`, submit to `friend_heat_runs` and the global leaderboard after finish, and refresh the lobby afterward.
- Made `syncGhostRuns` swap to the lobby-best ghost (and hide the personal-best ghost) when an active heat matches the loaded course; non-heat racing keeps the existing top-board + PB ghost pair.
- Added a friend-heat polling subscription that triggers re-render on snapshot changes, switches the loaded course to match the lobby's course when entering a heat, and emits a `LOBBY BEST` toast when the lobby-best run changes.
- Updated the active plan (`docs/plans/2026-05-17 2127 Plan - Friend Heat Multiplayer.md`) to `status: complete` with an implementation log.
- Build-checked with `npm run build` (tsc --noEmit + vite build): clean, only the existing >500kB chunk warning remains.

## What worked

- Reusing the existing `GhostRun` shape for `friend_heat_runs.ghost` meant lobby-best ghosts replay through the existing `GhostReplay` without changes.
- Plumbing the next-attempt-only ghost rule fell out naturally because `syncGhostRuns` is only called at attempt start (and on snapshot changes outside a run).
- Polling (3s lobby / 6s heat) was enough to keep the lobby readable without needing Supabase Realtime in v1.

## What didn't and why

- No live multi-client playtest yet because that needs at least two browsers signed in with the Supabase env configured.
- Anti-cheat is intentionally absent; trust-based per the plan.

## Decisions made

- Friend Heat is gated on Supabase configuration; if no URL/key, the Friend Heat title action surfaces a toast and stays on the title screen.
- The lobby's `host_name` is the only writer that "should" call `startHeat`/`closeHeat`, but the RLS policy is permissive in v1; the UI hides those buttons for non-hosts.
- Heat duration is fixed-choice at create time: 3, 5, 10, or 15 minutes.
- Invite codes use a 6-character base-30 alphabet (no `I`, `L`, `O`, `0`, `1`).

## Left unfinished

- Manual two-browser playtest with Supabase env configured.
- A heat-end auto-transition to `friend-results` (current flow shows the standard results scene after each attempt and leaves the player in the lobby; if the timer hit zero mid-run they can still see the final board through the lobby scene).
- Supabase Realtime channels in place of polling (deferred per plan).

## state.md updated: yes
