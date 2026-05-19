status: complete

# Plan - Friend Heat Multiplayer
_Created: 2026-05-17 2127_

## Goal

Define a future private multiplayer mode where friends race the same course during a short shared heat, chasing only the best completed run from that lobby while still allowing valid runs to feed personal records and the global leaderboard.

## Steps
1. Add Friend Heat as a future mode in the product outline, clearly separate from the current solo time-trial implementation.
2. Preserve the core mode rules: invite-code lobby, ready flow, shared heat timer, lobby-best ghost only, no global top ghost in the heat, no personal-best ghost in the first version, and next-attempt-only ghost updates.
3. Design the backend shape before implementation: lobbies, participants, heat sessions, run submissions, lobby-best selection, and global leaderboard submission from the same completed run.
4. Add lobby UI later: create/join by invite code, course selection, ready state, heat countdown, active heat standings, and final heat results.
5. Update race-mode ghost selection later so Friend Heat reads from the current lobby-best run instead of personal-best or global top-board ghosts.
6. Add realtime or polling updates later so clients learn when a faster lobby-best run exists, then apply that ghost on the next attempt start.
7. Keep the first implementation trust-based; anti-cheat and authoritative run validation are deferred.

## Notes

- This plan is intentionally documentation-only for now. Do not begin implementation until the user explicitly asks for it.
- The final-run rule is settled: when the heat timer reaches zero, existing attempts may finish and count, but no new attempts can start.
- Friend Heat should feel like a private claim-board rivalry between friends, not a public ranked queue.
- Every valid completed Friend Heat run should still submit to personal records and the global course leaderboard. If a heat run beats the global top time, it should become the new public top run outside the lobby.

## Implementation log (2026-05-18 2345)

- Supabase tables `friend_heat_lobbies`, `friend_heat_participants`, `friend_heat_runs` added to `docs/database/supabase-racing.sql` with permissive RLS for trust-based first version.
- `src/game/racing/friendHeat.ts` provides the client (`FriendHeatClient`) with create/join by invite code, ready toggle, host start, run submit, polling (3s lobby, 6s heat), `canStartAttempt`, and lobby-best snapshot.
- `src/main.ts` adds `friend-entry`, `friend-lobby`, and `friend-results` scenes, a Friend Heat title/course action, lobby UI with invite code/timer/participants/heat board, heat attempt flow (`startHeatAttempt`/`raceIsHeatAttempt`), dual submission to leaderboard + heat runs, and ghost swap so the lobby-best replaces the top-board ghost during an active heat.
- Final-run rule enforced: `canStartAttempt` returns false once remaining time hits zero; in-progress run can still finish and submit because it's gated only at attempt start.
- Personal-best ghost is hidden during active heats, satisfying the v1 "lobby-best only" rule.
- Anti-cheat is still deferred; trust-based submission is the current contract.
