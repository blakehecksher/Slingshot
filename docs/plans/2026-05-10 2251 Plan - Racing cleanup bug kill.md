status: complete

# Plan - Racing cleanup bug kill
_Created: 2026-05-10 2251_

## Goal

Clean up the racing time-trial experience for public multiplayer play: simpler start screen, leaderboard-first ghost behavior, clearer gate and asteroid visuals, revised controller mapping, reliable audio cutoff on wrecks, visible countdown, hidden debug panels, and thrust/boost tuning that matches the intended control model.

## Steps
1. Simplify course select to courses plus a fixed-height top-10 leaderboard, with editable pilot name and no local/Supabase setup language, medals, split chips, or command footer.
2. Remap gamepad controls so LB is boost and RB makes right-stick X strafe instead of yaw.
3. Rebalance thrust so RT and LT are full forward/reverse thrust, strafe is 75% of main thrust, and boost applies to all thruster axes.
4. Add visible rotational thruster plumes for pitch, yaw, and roll.
5. Replace checkpoint gate colors with a simple next/later/done treatment.
6. Add stronger dead-iron asteroid visual treatment tied to density/mass.
7. Add an explicit 3-2-1-GO countdown overlay and cut gravity/creak loops when the ship is wrecked or reset.
8. Hide debug panels by default; keep P for tuning and O for HUD/controls/pad debug panels.
9. Build-check and update state/log.

## Notes
