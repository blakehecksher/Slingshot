# 2026-05-17 2127 - Friend Heat Multiplayer Plan

## What was done

- Documented Friend Heat as a future private multiplayer mode in the active product outline.
- Added a future implementation plan for invite-code lobbies, shared heat timers, lobby-best ghosts, and global leaderboard submission.
- Preserved the settled final-run rule: once the heat timer expires, existing attempts may finish, but no new attempts can start.
- Updated project state to point future sessions at the Friend Heat plan without starting implementation.

## What worked

- The existing fixed-interval ghost replay model maps cleanly to lobby-best ghost updates.
- The mode can avoid real-time networked racing physics while still feeling live through shared heat timing and next-attempt ghost updates.

## What didn't and why

- No code was changed or tested because this session was intentionally documentation-only.

## Decisions made

- Friend Heat uses invite-code private lobbies.
- The first version uses only the current lobby-best ghost inside the heat.
- Global top-board ghosts and personal-best ghosts are not shown inside Friend Heat in the first version.
- Valid heat runs still feed personal records and the global leaderboard.

## Left unfinished

- Implementation is deferred until explicitly requested.
- Backend schema, lobby UI, realtime updates, and Friend Heat race-state integration still need to be designed in code.

## state.md updated: yes
