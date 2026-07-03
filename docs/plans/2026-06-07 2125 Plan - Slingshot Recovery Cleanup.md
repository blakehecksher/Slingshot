status: active

# Plan - Slingshot Recovery Cleanup
_Created: 2026-06-07 2125_

## Goal

Recover Slingshot as a clean, focused asteroid time-trial racing game. The active codebase should support a simple playable loop: choose a course, fly one ship through asteroid fields and gates, crash/restart cleanly, finish a run, and see results. Remove or archive older systems that no longer serve that loop.

The main gameplay problem to solve is asteroid trust: visible near-route asteroids must either collide correctly or be clearly background-only. The current split between real gameplay asteroids and visual-only instanced density is creating broken player expectations.

## Steps

1. Freeze the active scope.
   - Keep course select, one ship, time-trial racing, checkpoints, asteroid fields, crash/restart, timer/results, and local records/ghosts only if they still support the racing loop.
   - Remove or archive mining, economy/cargo, hangar/upgrades, combat, enemies, weapons, pickups, unused ship-building systems, old course experiments, and stale prototype docs from the active path.

2. Audit the active entrypoint.
   - Start from `src/main.ts`.
   - List every active import and runtime branch.
   - Mark each system as keep, remove, or isolate.
   - Do not preserve inactive legacy systems just because they still compile.

3. Rebuild asteroid behavior around one clear rule.
   - Every solid-looking asteroid inside the playable corridor must be a real obstacle.
   - Visual-only asteroids must be clearly background: outside the route corridor, farther away, smaller, dimmer, or otherwise not read as immediate obstacles.
   - Remove fake visual-hazard collision checks.
   - Use one shape source for asteroid mesh scale and collider sizing.
   - Prefer simple reliable colliders over clever mismatched geometry.

4. Make asteroid generation route-aware.
   - Enforce start-area clearance.
   - Enforce gate clearance.
   - Enforce route corridor clearance for visual-only asteroids.
   - Support authored landmark asteroids as real bodies.
   - Generate real hazard asteroids near the route at a practical count.
   - Generate background instanced asteroids only where they cannot be mistaken for immediate collision targets.

5. Simplify the source layout.
   - Move toward a structure like:
     - `src/app/`
     - `src/racing/`
     - `src/player/`
     - `src/asteroids/`
     - `src/ui/`
     - `src/audio/`
     - `src/physics/`
     - `src/render/`
   - Keep simulation state separate from render objects where practical.
   - Do not do a broad rename unless it makes the cleanup easier to verify.

6. Simplify UI until the game feels good.
   - Keep course board, race HUD, pause/settings, and results.
   - Defer records polish, decorative screens, and extra flows until the asteroid/racing loop is reliable.

7. Add debug visibility.
   - Add toggles for real asteroid collider spheres, visual-only asteroid tint, route corridor volume, gate clearance zones, current ship speed, collision event logging, and real-vs-visual asteroid counts.
   - Use these tools to prove that near-route visuals match gameplay.

8. Split work across subagents in a new conversation.
   - Agent A: dead-code audit and safe removal plan.
   - Agent B: asteroid system rebuild.
   - Agent C: course generation and route-clearance cleanup.
   - Agent D: active entrypoint/main-loop simplification.
   - Agent E: debug tools and playtest checklist.

9. Verify the cleanup.
   - `npm run build` passes.
   - The app launches into a clean racing flow.
   - No active imports remain from removed legacy systems.
   - Near-route asteroids collide correctly.
   - Visual-only asteroids never appear as immediate fly-through obstacles.
   - Debug toggles can show collider/visual alignment.
   - There is one obvious place to edit asteroid density and course clearance.

## Notes

Suggested prompt for the fresh conversation:

```text
Read docs/state.md and docs/plans/2026-06-07 2125 Plan - Slingshot Recovery Cleanup.md. Use subagents for dead-code audit, asteroid rebuild, course generation cleanup, main-loop simplification, and debug/playtest tooling. The goal is a clean working asteroid time-trial racing game folder/files. Do not preserve mining, combat, hangar, economy, or old prototype systems unless they are actively required by the current racing loop.
```

Important current pain:

- The player wants dense asteroid fields that look correct and function correctly.
- The current visual-only asteroid split has damaged trust because some rocks look like obstacles but do not behave like obstacles.
- Prior local patches to collider sizing did not fix the player-visible issue.
- The next pass should solve the system design, not continue tuning isolated hitbox constants.
