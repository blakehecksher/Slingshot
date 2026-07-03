# 2026-05-21 2335 - Tutorial course onboarding

## What was done

- Added tutorial course metadata and tip triggers to race course authoring.
- Added five training maps before the existing courses: Clear Line, Drift Yard, Boost Run, Soft Pull, and Hook Pass.
- Added authored gravity anchors so tutorial courses can place deterministic Dead Iron wells instead of relying only on procedural generation.
- Added Training labels, tutorial difficulty labels, and better gravity labels on the course board.
- Added short non-pausing tutorial toasts during uncompleted training runs.
- Ran `npm.cmd run build` successfully.

## What worked

- Zero-asteroid tutorial maps build cleanly.
- Authored gravity anchors integrate with the existing asteroid field, minimap, trajectory prediction, collisions, and gravity sampling paths.
- Tutorial courses remain normal time-trial courses with existing PB, split, ghost, and leaderboard paths.

## What didn't and why

- In-app browser automation reported the `iab` browser was unavailable.
- Vite reached ready state when started in a hidden background process, but the process exited before an HTTP smoke check could connect.

## Decisions made

- Tutorial onboarding lives at the top of the existing course board.
- Tutorial courses stay all unlocked.
- Tutorial instruction uses light non-pausing prompts only.

## Left unfinished

- Manual browser/controller playtest of all five tutorial maps.
- Tune Soft Pull and Hook Pass anchor strength after hands-on flight.
- Confirm prompt timing feels helpful without covering important race feedback.

## state.md updated: yes
