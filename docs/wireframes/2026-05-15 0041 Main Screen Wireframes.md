# Main Screen Wireframes
_Created: 2026-05-15 0041_

Low-fidelity direction for the main Slingshot time-trial screens. These are layout sketches, not final UI. The target feeling is practical field hardware: claim-board timing records, worn cockpit terminals, rugged checkpoint equipment, and Dead Iron course language.

## Shared UI Language

- Surfaces: dark dirty-gray panels, off-white labels, amber warnings, muted green/teal instrument states, rust/warm-metal accents.
- Shape language: compact terminals, bolted panel edges, field labels, scan lines, simple dividers, no glossy racing luxury.
- Text voice: plain pilot/depot language. Prefer `That rock is pulling hard` over technical exposition.
- Background: live or static race-field view whenever useful. Menus should feel mounted over the field, not separate from it.
- Primary action: always obvious and close to the current racing intent.

## 1. Boot / Title

Purpose: establish identity quickly, then hand off to course selection.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ FIELD VIEW: distant depot lights, checkpoint beacons, slow asteroid drift  │
│                                                                            │
│  SLINGSHOT                                                                 │
│  Dead Iron time trials                                                     │
│                                                                            │
│  ┌─ FIELD TERMINAL ───────────────────────────┐                            │
│  │ Callsign  [ RUST-17____________ ]          │                            │
│  │ Last run  Dead Iron Sweep  01:18.442       │                            │
│  │                                            │                            │
│  │ [ RACE ]  Records  Settings                │                            │
│  └────────────────────────────────────────────┘                            │
│                                                                            │
│  lower corner: build/version + connection/leaderboard state                │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- On repeat visits this can collapse into the course board.
- Title should look like painted/stenciled field equipment, not a marketing splash.
- Background can show a muted starter course flyby or parked timing beacon.

## 2. Course Select / Race Board

Purpose: the main non-race screen. Pick a course, see stakes, launch quickly.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ SLINGSHOT / CLAIM BOARD                         Callsign [RUST-17____]     │
├────────────────────────────────────────────────────────────────────────────┤
│ COURSE BOARD                 │ SELECTED COURSE: DEAD IRON SWEEP            │
│                              │ "Dense belt. Commit early. Don't get held." │
│ > Claim Shakedown            │                                             │
│   Open claim / low pull      │  Difficulty      ███░░                      │
│   PB 01:42.118               │  Gravity         ████░                      │
│                              │  Asteroid density████░                      │
│ > Dead Iron Sweep            │                                             │
│   Belt run / hard pull       │  Best            01:18.442                  │
│   PB 01:18.442               │  Target ghost    Top board: MACK-04         │
│                              │                                             │
│ > Black Core Run             │  ┌─ TOP BOARD ──────────────────────────┐   │
│   Deep field / heavy wells   │  │ 1  MACK-04     01:14.008   ghost     │   │
│   PB --:--.---               │  │ 2  RUST-17     01:18.442   PB        │   │
│                              │  │ 3  VERA-9      01:20.915             │   │
│                              │  └──────────────────────────────────────┘   │
│                              │                                             │
│                              │ [ LAUNCH RUN ]  Ghost  Records  Settings   │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- This should feel like a depot timing board, not a level-select carousel.
- Course descriptions should be short field warnings.
- Leaderboard rows should show ghost availability without becoming a pasted web table.
- Primary action stays on the selected-course side so launch is immediate.

## 3. Pre-Race Setup Overlay

Purpose: confirm course and ghost without creating a slow extra menu.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ dimmed live view of start gate and first asteroid cluster                  │
│                                                                            │
│                      ┌─ RUN SETUP ───────────────────────┐                 │
│                      │ DEAD IRON SWEEP                   │                 │
│                      │ Target ghost  ◉ Top board         │                 │
│                      │               ○ Personal best     │                 │
│                      │               ○ None              │                 │
│                      │                                   │                 │
│                      │ PB       01:18.442                │                 │
│                      │ Target   01:14.008 MACK-04        │                 │
│                      │                                   │                 │
│                      │ LT/RT thrust  Stick steer  LB/RB boost              │
│                      │                                   │                 │
│                      │ [ START ]      Back               │                 │
│                      └───────────────────────────────────┘                 │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Keep this as an overlay on the race scene.
- If ghost choice becomes too much friction, move it back into course select and let this screen disappear.

## 4. Countdown / Launch

Purpose: make the start physical, legible, and tense.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ full race camera, ship locked on start line                                │
│                                                                            │
│ top left: DEAD IRON SWEEP       top right: target MACK-04  01:14.008       │
│                                                                            │
│                                                                            │
│                              ┌────────────┐                                │
│                              │     3      │                                │
│                              └────────────┘                                │
│                                                                            │
│ bottom: muted HUD already visible, controls inactive until GO              │
│ rumble/audio ramp rises as gate hardware powers up                         │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Use the existing large countdown, but frame it like gate hardware firing.
- Avoid extra instructions during countdown. The player is already committed.

## 5. Race HUD

Purpose: racing decisions at speed. The HUD should be sparse, stable, and readable.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ TIME  00:42.318        SPLIT  -00.284        BEST  01:18.442              │
│ GATE  5 / 11           NEXT   620m           SPEED  184 m/s               │
│                                                                            │
│                         3D WORLD / ACTIVE GATE                             │
│                amber upcoming gates, green required gate                   │
│                                                                            │
│      off-screen green edge glow when required gate leaves view             │
│                                                                            │
│  ┌─ TRAJECTORY ────────┐                                      ┌─ SHIP ───┐ │
│  │ predicted line      │                                      │ hull 82  │ │
│  │ gravity wells       │                                      │ boost 41 │ │
│  │ next/finish markers │                                      │ pull HIGH│ │
│  │ ghost marker        │                                      └──────────┘ │
│  └─────────────────────┘                                                   │
│                                                                            │
│ bottom center: brief split callout only when crossing a gate               │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Timer, gate, speed, and delta are always-on.
- Trajectory/minimap is a signature element, not debug UI.
- `Pull HIGH` should feel like a field warning from ship instruments.
- Keep ghost ship translucent and readable without hiding asteroids/gates.

## 6. Pause Menu

Purpose: stop cleanly without losing race context.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ blurred/frozen race view, HUD still faintly visible                        │
│                                                                            │
│                      ┌─ PAUSED ───────────────────────┐                    │
│                      │ Dead Iron Sweep                │                    │
│                      │ 00:42.318  Gate 5/11           │                    │
│                      │                                │                    │
│                      │ [ RESUME ]                     │                    │
│                      │ Restart run                    │                    │
│                      │ Change course                  │                    │
│                      │ Settings                       │                    │
│                      │ Quit to title                  │                    │
│                      └────────────────────────────────┘                    │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Compact and practical.
- Restart should be near resume because retry speed matters.

## 7. Wreck / Invalid Run Overlay

Purpose: explain failure, then restart fast.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ frozen aftermath view: ship drift, missed gate, or heavy-rock capture      │
│                                                                            │
│                      ┌─ RUN LOST ─────────────────────┐                    │
│                      │ Wrecked near heavy rock         │                    │
│                      │ Time 00:57.104  Gate 8/11      │                    │
│                      │                                │                    │
│                      │ That rock was pulling hard.     │                    │
│                      │                                │                    │
│                      │ [ RETRY ]  Course board         │                    │
│                      └────────────────────────────────┘                    │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Failure language should be specific and short.
- No long animation lockout.

## 8. Finish / Results

Purpose: turn a finished run into learning and another attempt.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ dim field view past finish gate                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ DEAD IRON SWEEP RESULTS                         Callsign RUST-17           │
│                                                                            │
│ FINAL TIME      01:16.903        PERSONAL BEST     NEW PB  -01.539         │
│ BOARD           #2 pending      GHOST             saved from this run      │
│                                                                            │
│ ┌─ SPLITS ───────────────────────────────────────────────────────────────┐  │
│ │ Gate 1  +00.112  slow launch                                           │  │
│ │ Gate 2  -00.309  good hot pass                                         │  │
│ │ Gate 3  -00.052                                                        │  │
│ │ Gate 4  -00.841  gained in belt                                        │  │
│ │ Finish  -01.539                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│ [ RETRY ]  Race new ghost  Change course  Records                          │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Retry is primary.
- Results should answer where time changed, not just celebrate the final number.
- Keep leaderboard submission state visible but quiet.

## 9. Records / Leaderboards / Ghosts

Purpose: browse targets and choose a chase without feeling like a website table.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ RECORDS / GHOST LINES                                                      │
├────────────────────────────────────────────────────────────────────────────┤
│ Course [ Dead Iron Sweep v ]                                               │
│                                                                            │
│ ┌─ TOP BOARD ────────────────────────┐ ┌─ YOUR RUNS ────────────────────┐ │
│ │ 1 MACK-04   01:14.008  [chase]     │ │ PB        01:16.903 [chase]     │ │
│ │ 2 RUST-17   01:16.903  you         │ │ Last      01:16.903             │ │
│ │ 3 VERA-9    01:20.915              │ │ Recent    01:18.442             │ │
│ │ 4 KLINE     01:22.104              │ │ Recent    wreck gate 8          │ │
│ └────────────────────────────────────┘ └────────────────────────────────┘ │
│                                                                            │
│ selected ghost line preview: course map strip + split markers              │
│                                                                            │
│ [ USE SELECTED GHOST ]  Back                                               │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Rows can be dense, but style them as a timing board.
- Empty states should still feel in-world: `No posted times from this board`.

## 10. Settings

Purpose: precision control and readability, available before and during racing.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ SETTINGS                                                                   │
├────────────────────────────────────────────────────────────────────────────┤
│ Controls             │ Display/HUD                 │ Audio/Feedback        │
│                      │                             │                       │
│ Stick sensitivity [] │ HUD scale       [---|---]   │ Master       [--|--]  │
│ Invert pitch    [ ]  │ Minimap size    [----|--]   │ Rumble       [---|-]  │
│ Invert yaw      [ ]  │ Ghost opacity   [--|----]   │ Hull groan   [---|-]  │
│ Layout          std  │ Camera shake    [--|----]   │ Warning tone [--|--]  │
│                      │ Reduced motion  [ ]         │                       │
│                      │ Color-safe danger [ ]       │                       │
│ Graphics quality [medium v]       Fullscreen [ ]                           │
│                                                                            │
│ [ APPLY ]  Reset defaults  Back                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

Notes:

- Organize settings around why players need them: control precision, readability, feedback.
- If assists later affect leaderboard fairness, separate those clearly from display/accessibility.

## First Implementation Slice

If these feel right, the first UI pass should probably focus on:

1. Course select/race board.
2. Race HUD layout and trajectory/minimap prominence.
3. Finish/results retry loop.
4. Settings shell for control/readability options.

Those four screens carry most of the product direction and give the rest of the UI a clear language to follow.
