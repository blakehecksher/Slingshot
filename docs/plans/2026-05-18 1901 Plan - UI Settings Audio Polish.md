status: active

# Plan - UI Settings Audio Polish
_Created: 2026-05-18 1901_

## Goal

Turn the current racing build into a more coherent, playable-feeling slice by making all major UI views match the start screen, improving the cockpit/race HUD, allowing players to tune ship feel while paused or in-run, and adding a complete first-pass audio feedback layer.

## Steps
1. Audit the current start screen, pause, results, invalid, settings, and race HUD surfaces for visual mismatches.
2. Make the start screen the UI standard: apply the same Amber Iron claim-board terminal language, typography, spacing, button states, borders, colors, and footer hint treatment to pause, results, invalid, and settings views.
3. Add records comparison to the title/course board, visually tied to the personal-best area, showing per-gate time deltas between the latest/current reference run, personal best, and board leader.
4. Redesign the race/cockpit HUD around always-useful racing information: timer, gate count, speed, boost/energy, hull/impact state, split delta, ghost target, minimap/trajectory, and gravity danger.
5. Keep the HUD readable in both chase and cockpit camera modes, with cockpit mode getting stronger in-world/instrument framing rather than feeling like the same flat overlay.
6. Replace the flat minimap with a 3D holographic sphere showing mapped asteroids, trajectory, next gate, finish, and ghost ships.
7. Keep settings as a separate paused screen, because flying while adjusting values is not usable in practice.
8. Expand ship-feel settings beyond the current stick sensitivity/invert options where useful: thrust feel, turn sensitivity, strafe strength, boost response, camera follow/shake, rumble, HUD scale, minimap size, ghost opacity, and audio levels.
9. Persist settings in localStorage so players keep their preferred feel between sessions.
10. Add menu sound effects for focus movement, confirm, back, unavailable/error, pause, resume, race start, retry, finish, and invalid/wreck states, preferring soft free/CC0 samples over sharp synthesized beeps.
11. Add flight sound effects for forward/reverse thrust, maneuver thrusters, boost, energy drain/low energy, close-gravity pressure, gate pass, checkpoint miss/invalid, collision/wreck, and dust/debris impact on asteroids.
12. Add a first-pass soundtrack system with separate music volume, menu/race/result music states, smooth transitions, and a placeholder asset manifest that can accept user-provided MP3s later.
13. Add graceful behavior when soundtrack MP3s are missing: no console spam, no broken UI, and procedural/ambient audio continues to work.
14. Build-check after each major track and manually inspect/playtest in browser at desktop and mobile widths, including controller navigation and cockpit camera readability.

## Notes

- The user will provide soundtrack MP3 files later; implementation should not block on them.
- Procedural Web Audio is acceptable for first-pass UI and gameplay effects where no final asset exists yet.
- Selected Kenney Interface Sounds samples are used for softer CC0 UI sounds. Source: `https://kenney.nl/assets/interface-sounds`.
- Audio should follow the existing lore direction: mechanical, worn, field-equipment feedback rather than clean sci-fi beeps.
- Settings that affect comfort/readability are safe for leaderboards. If future settings become assists that materially change difficulty, leaderboard categorization should be revisited.
- Friend Heat remains deferred and is not part of this plan.
- The user screenshot is direction only; records comparison should be adapted to the existing Amber Iron claim-board UI rather than copied directly.
