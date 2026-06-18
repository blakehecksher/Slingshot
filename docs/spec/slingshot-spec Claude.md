# Slingshot — Game Specification

**Version:** 1.0 (committed spec — decisions resolved, no version seams)
**Author:** Blake
**One-line concept:** A browser-based 3D space-racing time trial where you navigate the gravity wells of "dead iron" asteroids — flying close enough to slingshot off them without being pulled in and crashing.

**On this document:** This is the complete game spec. Where a design or technical decision was previously deferred, it is now resolved as a committed **Decision**, with fallback directions listed beneath it as nested bullets:

> - **Decision** — the committed choice and why.
>   - Fallback direction if the decision proves wrong in playtest/spike.
>   - Secondary fallback.

Fallbacks are not roadmap items. They are pre-considered escape hatches, taken only if the primary decision fails a stated acceptance criterion.

---

## 0. Concept Ladder (zoom-out → zoom-in)

**One sentence:** Fly a ship through a course of waypoints as fast as possible by grazing dangerous gravity wells for free speed.

**Two sentences:** Each course is a string of waypoints (asteroid orbits) scattered through space. The fast line threads dangerously close to "dead iron" asteroids whose gravity slingshots you forward — but get greedy and the same gravity pulls you into a crash.

**Paragraph:** Slingshot is a single-player time-trial racer played with an Xbox controller in the browser. You pilot a 6-degree-of-freedom ship with thrust, boost, and full rotation. The course is defined by ordered waypoints, each being a ring you must pass through, positioned in the orbit of an asteroid. Two asteroid types exist: ordinary rock (cosmetic obstacle, harmless pull-wise) and dead iron (visually distinct, enormous gravitational pull). Gravity is real-ish — inverse-square, momentum-conserving — so dead iron bends your trajectory. The optimal racing line uses these wells as gravity assists to gain speed and change heading without spending fuel/time on thrust. Hit a dead iron asteroid (or get captured by one) and you crash, respawning at your last waypoint with a time penalty. Your best run becomes a replayable "ghost," and the global #1 run on each course is downloaded as a second ghost to race against. Times sync via Supabase.

---

## 1. Experience Walkthrough (every screen, every transition)

### 1.1 Boot → Title

- Page loads on GitHub Pages. Black, starfield fades in. Title "SLINGSHOT" with a slow-drifting dead iron asteroid behind it, faintly warping the starfield around it (visual promise of the core mechanic).
- Controller connection state shown bottom-center: "Connect a controller" → "Controller connected ✓" when a gamepad is detected via the Gamepad API.
- Prompt: *Press A to start.* (Keyboard fallback: Enter.)

### 1.2 Main Screen (menu + course select + leaderboard, unified)

The main menu and course select are **one screen**, not two.

- **Layout:** a 1/3 — 2/3 vertical split.
  - **Left third:** the course list, scrolling vertically for more courses. Each course row shows: course name, a wireframe path preview, your PB time, and the current world record + holder tag.
  - **Right two-thirds:** the leaderboard for the currently highlighted course (the in-world "timing board," styled per §5.5), with a **Race** button anchored at the bottom of this pane.
- Navigation: stick/d-pad moves through the course list on the left; the leaderboard on the right updates live to match the highlighted course. **A** (or the Race button) launches the highlighted course.
- **Settings** is reachable from this screen (e.g. a corner button / Start), opening §1.8.
- Player identity: first launch asks for a 3-character tag (arcade-style) + optional display name, stored locally and used for leaderboard submission. No accounts/login.

### 1.3 Pre-Race

The pre-race flow differs between a **fresh entry** (coming from the main screen) and a **re-run** (after a crash-restart or a manual restart). This distinction exists to cut waiting — you will crash constantly while learning a course, and you want to be flying again immediately.

**Fresh entry (from main screen):**
- Camera does a quick fly-through of the course path (skippable), so the player sees the waypoint sequence and where the dead iron clusters are.
- Ship spawns at the start gate. HUD fades in.
- Countdown: 3 – 2 – 1 – GO. Timer starts on GO. Player input locked until GO (locked, not buffered, to keep starts fair).

**Re-run (after death-respawn-to-start or manual restart):**
- **No fly-through, no countdown.** Ship sits at the start gate, ready.
- The timer starts the instant thrust input is detected. The first frame of thrust = your GO.
- This is the default state the player lives in while grinding a course.

### 1.4 Racing (the core loop)

- Player flies. HUD shows: current time, split vs. ghost, next-waypoint indicator (off-screen arrow), speed, boost meter (fixed reserve — see §2.5).
- **Ghosts:** up to two translucent ships fly their recorded runs in real time — your PB (one color) and the WR (another color). They are non-colliding, purely visual.
- Passing through a waypoint gate: gate flashes, satisfying audio tick, split updates, next gate becomes the active (green) gate.
- **Gate color states** (see §2.3): the required/next gate reads **green**, upcoming gates read **amber**, passed gates fade to **faint neutral**. The off-screen indicator shares the active gate's green so guidance and target always match.
- Near a dead iron asteroid: proximity warning intensifies (screen-edge vignette, audio pitch rise, controller rumble ramps with gravitational force magnitude). This is the core feedback channel — the player should *feel* the well through the controller.
- **Restart at any time:** pressing **Back/Select** restarts the run from the beginning, returning to the re-run ready state in §1.3 (no countdown; timer waits for thrust).
- Crash (collision or capture): hard cut, brief slow-mo + screen crack, respawn at last passed waypoint with velocity zeroed. Time keeps running; a fixed penalty is also added. Brief "respawning" beat (~0.5s).

### 1.5 Finish

- Final waypoint passed → timer stops, ship auto-decelerates, camera swings to a hero shot.
- Result card: final time, delta vs. PB, delta vs. WR. If PB: "NEW PERSONAL BEST." If WR: "WORLD RECORD" with extra fanfare.
- If a new PB, the run is saved locally as the new ghost and submitted to Supabase.
- Options: **Retry**, **Next Course**, **Menu**. (Retry drops into the §1.3 re-run ready state.)

### 1.6 Leaderboards (the in-world "timing board")

The leaderboard is not a separate destination — it lives in the right two-thirds of the main screen (§1.2), bound to the highlighted course.

- Per-course global top N (default 100). Columns: rank, tag, time, date. Your row highlighted. Pulled live from Supabase.
- Styled as a worn depot terminal / claim-board readout, not a clean modern table (see §5.5).

### 1.7 Settings

- Controller sensitivity (rotation rate), invert pitch (Y), rumble on/off, master/SFX/music volume, ghost visibility toggles (PB ghost / WR ghost independently), reset PBs.

---

## 2. System Spec (mechanics, data model, tuning)

### 2.1 Flight model (6DOF)

- Ship has position, orientation (quaternion), linear velocity, angular velocity.
- **No drag in space** — momentum is conserved. (Light rotational damping only, for controllability — see §2.1.1.)
- Controls:
    - **Left stick:** pitch (Y) + roll (X).
    - **Right stick:** yaw (X) + translate up-down (Y).
    - **D-Pad:** left/right translate left/right; up/down translate up/down.
    - **Right trigger (RT):** main thrust (analog).
    - **Left trigger (LT):** reverse/brake thrust (analog).
    - **LB / RB:** boost (consumes the fixed boost reserve — see §2.5).
    - **Start:** pause. **Back/Select:** restart run.
- Thrust applies force along the ship's forward vector. Rotation applies torque (see §2.1.1).

#### 2.1.1 Rotation model

- **Decision — Torque-based rotation with light angular damping.** Input applies torque; angular velocity carries between inputs and is bled off slowly by a tunable damping term. This is the only model consistent with the momentum-conserving, sim-gravity core — the ship should feel like a mass you're wrestling, and slingshot maneuvers should require anticipating your own rotational inertia. Damping keeps it controllable without making it feel arcade-snappy.
  - **Fallback — Torque-based with heavier damping.** If the light-damping feel is too floaty/uncontrollable in Phase 1, raise the damping coefficient toward near-critical so rotation settles quickly while still preserving momentum carry.
  - **Fallback — Direct angular-velocity (arcade).** If torque feels bad even heavily damped, set angular velocity directly from input (snappy, immediate, no rotational inertia). This sacrifices sim consistency for control; take it only if Phase 1 acceptance fails on "feels bad to aim."

### 2.2 Gravity (the heart of the game)

- Each dead iron asteroid is a point mass with mass `M` and radius `R`.
- Force on ship: `F = G * M / d²` toward the asteroid center, where `d` = distance from ship to center, clamped at minimum `d = R + ε` to avoid singularity.
- Ordinary asteroids: **zero gravity**, but collidable, no pull — they're obstacles, not hazards-with-reward.
- `G` is a game constant, not the real gravitational constant — tuned per feel.
- **Capture ("soft capture" in-world):** if the ship's speed at a given distance is below escape velocity `v_esc = sqrt(2 * G * M / d)` AND it's inside a "capture shell" (e.g. `d < 2R`), and isn't actively thrusting outward enough to escape within `T_capture` seconds, flag as captured → triggers crash. This prevents the death-spiral feel-bad: you crash fast instead of flailing in a decaying orbit. A brief dramatic orbit before the crash is fine — the crash just needs to resolve quickly either way.
- Multiple dead iron bodies sum their forces (N-body on the ship only). Asteroids themselves are static/fixed (but rotate slowly in place for visual "aliveness") to keep courses deterministic — critical for ghosts and WRs to be comparable.

> **Design note:** Asteroids MUST be static. If asteroids move or gravity is N-body among them, runs aren't reproducible and ghosts/leaderboards become meaningless. Determinism is a hard constraint (§9).

### 2.3 Waypoints (in-world: "gates" / a clean run is a "ghost line")

- Ordered list. Each waypoint = a gate (holographic center ring inside rugged field hardware — see §5.5) positioned in/near an asteroid's orbit, with a center, orientation (the plane you fly through), and radius.
- Pass detection: ship crosses the ring plane within the ring radius, in the correct order. Out-of-order passes ignored.
- **Visual state (drives rendering + off-screen indicator):**
    - `ACTIVE` (the required next gate) → **green** holographic ring, full-strength struts/strobes.
    - `UPCOMING` (any gate after the active one) → **amber**, secondary brightness.
    - `PASSED` → **faint neutral**, dimmed, clearly "done."
    - Exactly one gate is `ACTIVE` at a time; passing it promotes the next `UPCOMING` gate to `ACTIVE`.
- Final waypoint = finish.

### 2.4 Timing & penalties

- Timer starts on GO (fresh entry) or on first thrust (re-run) — see §1.3. Stops on final waypoint pass.
- Crash penalty: respawn at last passed waypoint (position + the waypoint's "entry" orientation), velocity zeroed, **plus a fixed time penalty** (e.g. +3s, tunable). Timer never pauses — wall-clock honest.
- Respawn point = last *successfully passed* waypoint (start gate if none passed yet).

### 2.5 Boost

- **Decision — Fixed reserve per course, no regeneration.** Each course grants a generous but fixed boost budget for the whole run. Boost does not regenerate, is not earned by grazing, and is not a recharging meter. The HUD meter shows the remaining reserve depleting.
- **Mechanic:** boost is a **multiplier** applied to thrust output — it multiplies forward and reverse thrust, and left/right translation, for as long as it's held and reserve remains. It is not a one-shot impulse; it's a "burn faster from your fixed tank" modifier.
- **Why:** a fixed reserve makes boost a strategic resource the player allocates across the course (spend it on the straights? save it for the hard slingshot exit?), and keeps scoring pure — no grazing-to-refuel loop muddying the time-trial.
  - **Fallback — Fixed discrete charges.** If a continuous multiplier reserve is hard to read/manage, split the budget into N discrete boost charges per course, each a fixed-duration burn.
  - **Fallback — Regenerating meter.** Only if a fixed budget proves un-fun (e.g. players brick a run early and feel they have nothing left to do): a slow-regenerating meter. Avoid unless fixed-reserve fails playtest — regen reintroduces flow-vs-purity tradeoffs the fixed model is specifically chosen to dodge.

### 2.6 Ghosts

- A ghost = a recorded time series of ship transforms (position + quaternion) sampled at fixed Hz (e.g. 15–30Hz), plus the final time.
- Stored: compressed array. PB ghost stored locally (and is the user's submitted run). WR ghost downloaded from Supabase (the recording is stored alongside the time).
- Playback: interpolate transforms against the live timer. Ghost ship is visual only.

#### 2.6.1 Ghost storage strategy

- **Decision — WR-only blob.** Only the current world-record run per course carries a downloadable ghost recording (`ghost_blob`). Every other row on the timing board is a time only. This keeps Supabase storage trivial (one recording per course) while still giving every player a ghost to chase (their local PB) and a target to beat (the WR).
  - **Fallback — Top-N blobs.** If players want to race against more than just the WR (e.g. "race the #3 line"), store ghost blobs for the top N rows per course, accepting the storage cost.
  - **Fallback — Compress harder / lower sample rate.** If WR-only is fine but individual blobs are still too large, drop sample Hz or apply stronger delta-compression before widening storage.

### 2.7 Data model (Supabase)

`courses` (static; may live as client-side JSON):
- `id`, `name`, `path_definition` (waypoints, asteroid placements)

`runs`:
- `id` (uuid)
- `course_id`
- `player_tag` (3 char), `display_name` (nullable)
- `time_ms` (int)
- `created_at`
- `ghost_blob` (nullable — populated only for the WR row per §2.6.1)
- `client_version`

Leaderboard query: `select tag, time_ms, created_at from runs where course_id = ? order by time_ms asc limit 100`.
WR ghost query: the row with min `time_ms` for the course, fetch its `ghost_blob`.

### 2.8 Anti-cheat posture

GitHub Pages + public Supabase means client-side play **cannot be fully secured against cheating.** The committed posture:

- **Decision — Server-side ghost replay validation via Supabase edge function.** On submit, an edge function re-simulates the submitted ghost against the deterministic physics and verifies the resulting time matches the claimed `time_ms` within tolerance before accepting it as a record. Because physics is fixed-timestep and deterministic (§9), the server can reproduce the run exactly. This is the real defense and it's in scope.
  - Baseline mitigations that ship regardless: RLS allowing only `INSERT`/`SELECT` (no `UPDATE`/`DELETE`); a per-course `time_ms` sanity floor rejecting impossibly fast times; stored `client_version`.
  - **Fallback — Sanity-bounds only.** If the edge-function replay proves too costly or flaky to run on every submit, fall back to the bounds checks above and accept that determined cheating is possible. Run replay validation only on runs that would become the new WR.
  - **Fallback — WR-challenge validation.** Validate only when a submission claims a new world record (the only row that carries a ghost anyway per §2.6.1), since that's the only score anyone is incentivized to fake and the only one with a recording to replay.

---

## 3. State Machine + Edge Cases

### 3.1 Top-level states

```
BOOT → TITLE → MAIN_SCREEN → PRE_RACE → [COUNTDOWN | READY_WAIT] → RACING → FINISH
                   ↑                                                   ↕         ↓
                   └──────────────── (menu) ──────────────────────  PAUSED   (retry → PRE_RACE re-run)
                                                                              (menu → MAIN_SCREEN)
SETTINGS branches off MAIN_SCREEN and returns to it.
Leaderboard is not a state — it is a panel within MAIN_SCREEN (§1.2 / §1.6).
```

- `COUNTDOWN` is entered only on **fresh entry**; `READY_WAIT` (timer waits for first thrust) is entered on every **re-run** (§1.3).

### 3.2 RACING sub-states

- `FLYING` (normal)
- `IN_WELL` (inside a dead iron influence radius — drives feedback intensity, not a hard state change)
- `CRASHING` (collision/capture detected → slow-mo beat)
- `RESPAWNING` (repositioning at last waypoint)
- back to `FLYING`

### 3.3 Edge cases

| Case | Behavior |
| --- | --- |
| Controller disconnects mid-race | Auto-pause, show "Reconnect controller", resume on reconnect. Keyboard fallback remains active. |
| No controller ever connected | Keyboard controls available as fallback (document mapping); recommend controller. |
| Player flies away from course indefinitely | Soft boundary: an "out of bounds" volume. Past it, show warning + auto-respawn at last waypoint after `T_oob` seconds (penalty applies). |
| Captured by gravity, decaying orbit | Capture detection (§2.2) triggers CRASHING quickly — no infinite spiral. |
| Two dead irons close together, combined pull | N-body-on-ship sum handles it; ensure course design doesn't make a section impossible (playtest constraint). |
| Passing waypoints out of order | Ignored; only the next expected waypoint counts. |
| Clipping through an asteroid at high speed (tunneling) | Continuous collision detection (swept sphere/raycast along travel each frame). Discrete CD will miss at race speeds. **Hard requirement.** |
| Crash exactly on a waypoint | Respawn uses last *passed* waypoint; if crash occurs while passing, count the pass first. Pass-detection runs before crash-detection each frame. |
| Tab loses focus / alt-tab | Auto-pause game loop AND timer on `visibilitychange` (pausing is allowed; it doesn't help your time). Resume cleanly. |
| Manual restart (Back/Select) mid-race | Drop to `READY_WAIT` at the start gate; timer resets and waits for first thrust (§1.3 re-run). |
| Supabase unreachable on submit | Queue the run locally, retry on next launch; never block the finish screen on network. PB still saves locally. |
| Supabase unreachable on leaderboard load | Show cached board + "offline" indicator. |
| Two players tie exact time_ms | Order by `created_at` ascending (earlier wins). |
| Ghost recording corrupt / missing for WR | Race without WR ghost; show PB ghost only. Never hard-fail. |
| Player has no PB yet | No PB ghost shown; that's fine. |
| Float drift making physics non-deterministic across machines | Fixed timestep (accumulator pattern), not frame-rate-coupled. **Hard requirement.** |
| Ghost replay validation rejects a legit run | Edge function tolerance must account for float variance; on rejection, keep the local PB and flag the submit for retry/log rather than discarding silently. |

---

## 4. Boundary Definitions (Supabase)

- **Auth:** none (anonymous tag-based). Supabase used as a data store with RLS.
- **RLS policy:** anon role may `INSERT` into `runs` and `SELECT` from `runs`/`courses`. No `UPDATE`/`DELETE`.
- **Insert validation:** a `CHECK` (or trigger/edge function) rejecting `time_ms` below a per-course sanity floor; plus the replay-validation edge function (§2.8) for record claims.
- **Endpoints used:** Supabase JS client from the browser — `from('runs').insert(...)`, `.select().order().limit()`; edge function invoked on submit for validation.
- **Secrets:** only the anon public key ships in the client (that's its purpose). No service key client-side, ever.
- **CORS:** Supabase allows the GitHub Pages origin.

---

## 5. Feel Spec (easing, feedback, juice — the make-or-break layer)

- **Camera:** chase cam with slight lag/spring behind the ship; FOV widens subtly with speed (sense of velocity). Roll the camera slightly with the ship but dampened.
- **Speed sensation:** starfield parallax, motion streaks at high speed, subtle screen-space velocity blur (tasteful).
- **Gravity feedback (most important):** controller rumble magnitude scales with gravitational force on the ship — you literally feel the well deepen as you approach dead iron. Pair with a rising low-frequency audio drone + screen-edge vignette in the dead iron's color.
- **Dead iron visual language:** dark metallic, glowing veins, starfield lensing — it must *read as dangerous* at a glance vs. dull-gray inert rock; danger is legible before the HUD warns. Full art direction in §5.5.
- **Waypoint pass:** ring flash + bright "tick" SFX + small camera punch. Crisp and rewarding.
- **Slingshot moment:** when you graze close and the well flings you, lean into it — slight time-dilation whoosh, speed lines intensify, a distinct "whoosh past" sound. The reward for bravery should be *felt*.
- **Crash:** abrupt. Slow-mo for ~0.3s, screen crack/flash, low impact boom, then snap to respawn. Punishing but fast — back flying in under a second.
- **Countdown/GO:** punchy, builds anticipation (fresh entry only).
- **Boost:** FOV kick, pitch-up engine whine, brief speed-line burst; meter visibly drains from the fixed reserve.
- **General easing:** all UI transitions ~150–250ms ease-out. Nothing linear, nothing slow.

---

## 5.5 Art Direction (look, palette, world texture)

> This section is authoritative for the game's *look*; mechanics are unaffected. The world is scoped to support the racer only — everything here is texture (course names, UI styling, backdrop, flavor), **not gameplay systems.** See §9 for the explicit do-not-build list.

### Spiritual reference

A dangerous **working-field racing scene** built out of mining equipment, salvage culture, and rough competition. The races grew out of a field economy: pilots already had to fly close to Dead Iron wells to survive, and the skill became sport. Informal, practical, a little unsafe. Cowboy Bebop *in spirit* — functional, worn, specific — not literal anime, not space opera.

### Palette

Desaturated warm metal, rust, off-white, deep navy, amber, black iron, dirty gray, with muted teal/green instrument accents.

**Avoid:** pristine chrome sci-fi, neon cyberpunk, generic space opera, luxury racing gloss, purple/blue gradient futurism, big marketing hero sections, decorative UI that doesn't imply a function.

### Dead Iron — the danger language

Dead Iron is valuable because it behaves wrongly: dark metallic veins, dense nodules, glassy inclusions, buried cores. Field rule: *safest dispersed, most dangerous concentrated.* A Dead-Iron-rich asteroid must **read as dangerous before the HUD says so**. Visual signals:

- dark metallic seams across the surface
- exposed black / blue-black mineral faces
- glassy impact scars around dense deposits
- dust rings, captured debris, subtle orbiting fragments
- warm instrument glow / scan shimmer near exposed veins
- surface cracks implying something heavier inside
- starfield lensing/heat-shimmer distortion around the strongest wells

The strongest asteroids should feel **ancient, heavy, and wrong.** Ordinary rock, by contrast, is dull gray and inert — visually safe at a glance.

### Gates (race hardware)

Not clean arcade rings. Rugged navigation/race equipment adapted from field hardware: beacon struts, bolted emitter nodes, worn metal frames, antenna fins, warning strobes, visible power modules, maintenance markings — with a holographic center ring. Readability beats decoration: the active gate is unmistakable, upcoming gates visible but secondary, passed gates clearly faded (color states in §2.3).

### Ships

Working-field craft converted into racing machines — not luxury racecars, not generic fighters. Oversized maneuvering thrusters, exposed reaction-control clusters, reinforced nose cages, external engine pods, radiator fins, sensor booms, patched armor, worn paint, visible cable runs, asymmetric repairs. The silhouette should *explain how the ship turns, boosts, and survives stress.* Ship variety is kept minimal to protect the standardized racing loop — a ship should never distract from comparable runs.

### Depot

The menu/world backdrop. A practical foothold in low-gravity open space — fuel, repairs, parts, timing boards, rumors, bad coffee, a launch path back into danger. Practical, exposed, a little underbuilt. It's set dressing and UI framing, **not a hub with systems.**

### Sound (reinforces §5 Feel)

The sound of the field is part of the HUD. As the ship nears a strong well: low hull groan, subsonic rumble, cockpit vibration, controller rumble, mechanical (not sterile) warning tones, audio pressure on close passes — then silence snapping back in open space. A skilled player should know they're too close because *the ship sounds wrong.*

### Course settings (three tiers — see §7 Phase 6 for content mapping)

- **Open Claim Space** — low gravity, wider routes, sparse clusters, clearer starfield, warmer instrument colors, depot visible at distance. Forgiving slingshots; teaches gates, boost, the trajectory minimap. *Starter / training.*
- **Dead Iron Belt** — moderate-to-high gravity, blue-black metallic seams, red-orange fissures, captured debris, stronger contrast, industrial checkpoint hardware. Committed slingshot lines; mistakes matter; denser route reading.
- **Black Core Field** — deep-field racing around massive wells. Huge ancient asteroids, black metallic cores, glassy scars, oppressive scale, dimmer light, strongest rumble/vibration language. Speed required to survive; risky close passes; split-second trajectory decisions.

### Naming / UI vocabulary (workmanlike, not technobabble)

Use field language in player-facing text: **Dead Iron, Anchor Metal, wellstone, black nickel, dead core, heavy rock, well field, bad orbit, hot pass, soft capture, deep run, claim rock, wreck drift, timing board, ghost line, red pass.** A pilot says "that rock is pulling hard," not "the gravimetric substrate is destabilizing." Reserve clean technobabble only for a corporation name or an instrument readout.

Mapping onto mechanics: **timing board** = leaderboard (§1.6) · **ghost line** = a recorded run/ghost (§2.6) · **soft capture** = the capture-crash (§2.2) · **hot pass / red pass** = an aggressive close graze.

---

## 6. Tech Stack

- **Rendering:** Three.js.
- **Physics:** see decision below.
- **Input:** Gamepad API (poll each frame), keyboard fallback.
- **Persistence/leaderboard:** Supabase (Postgres + JS client + edge functions for validation).
- **Hosting:** GitHub Pages (static build via Vite).
- **Language/build:** TypeScript + Vite (consistent with prior projects).

### 6.1 Physics architecture

- **Decision — Hand-rolled fixed-timestep integrator for gravity + flight; Rapier for swept collision only.** Gravity and 6DOF motion are integrated by hand in a fixed timestep (accumulator pattern) so trajectories are bit-stable and deterministic across machines and refresh rates. Rapier is used purely for continuous/swept collision detection against asteroid colliders. This isolates the determinism-critical math (which Rapier's contact solver isn't built for) from the collision query (which Rapier does well).
  - **Fallback — Fully hand-rolled, drop Rapier.** If Rapier's stepping/queries introduce nondeterminism or just add weight for one collision query, replace it with hand-rolled swept-sphere raycasts against asteroid spheres and remove Rapier entirely. Asteroids are spheres, so swept-sphere-vs-sphere is tractable by hand.
  - **Fallback — Rapier for both integration and collision.** Only if hand-rolling the integrator proves error-prone and Rapier's stepping turns out deterministic enough in the Phase 0 spike: apply gravity as external forces per step and let Rapier integrate. Accept the determinism risk only if the spike proves it holds.

> **Biggest technical risk:** physics determinism across hardware. This is validated in the Phase 0 spike (§7) before any other work.

---

## 7. Implementation Plan (phased, with acceptance criteria)

> Phases are **build order**, not scope tiers. The whole game described above is in scope; phases sequence the work and de-risk it.

### Phase 0 — Spike (de-risk the unknowns) — before anything else

- Prove: fixed-timestep gravity integration produces identical trajectories across two machines / two refresh rates (60Hz vs 144Hz).
- Prove: swept collision catches a ship hitting an asteroid at max speed (no tunneling).
- Prove (informs §6.1): whether the chosen physics split holds determinism, or a fallback is needed.
- **Acceptance:** same input sequence → same final position on two different machines, within float tolerance; ship never tunnels through a collider at top speed across 1000 trials.

### Phase 1 — Flight & gravity (no course, no UI)

- Ship flies with full 6DOF controller input in an empty scene with one dead iron asteroid.
- Inverse-square pull works; you can orbit, escape, or get captured.
- Rotation model (§2.1.1) validated for feel; fall back if acceptance fails.
- **Acceptance:** you can intentionally slingshot off the asteroid and feel pulled in; capture triggers a crash state; rumble scales with force; rotation feels good to aim.

### Phase 2 — Course & timing

- Load a course definition (JSON): waypoints + asteroid placements. Ring-pass detection in order. Timer (both fresh-countdown and re-run thrust-start modes). Crash → respawn at last waypoint + penalty. Out-of-bounds handling. Manual restart → ready-wait.
- **Acceptance:** you can complete a full course start-to-finish; crashes respawn correctly; out-of-order passes ignored; re-run start waits for thrust; manual restart works; final time is correct and wall-clock honest.

### Phase 3 — Ghosts (local)

- Record run as transform time series. Save PB locally. Replay PB ghost against live run.
- **Acceptance:** your PB ghost replays in perfect sync with the timer; beating it saves a new ghost; ghost is visual-only (no collision).

### Phase 4 — Supabase leaderboard + validation

- Submit time on PB. Main-screen timing board reads top 100. WR row carries a ghost blob; download and race the WR ghost. Edge-function replay validation (§2.8) on submit.
- **Acceptance:** a new PB appears on the global board; WR ghost downloads and replays; offline submit queues and retries; offline board shows cache; a forged time fails replay validation.

### Phase 5 — Feel & polish pass

- Camera spring, FOV-by-speed, dead iron visual language + lensing, all SFX, rumble tuning, crash juice, slingshot whoosh, UI easing.
- **Acceptance:** a first-time player can tell dead iron from rock at a glance; the well is felt through the controller; crashes feel fast not frustrating; a clean run feels fast and good.

### Phase 6 — Content & balance

- Build the three course tiers from §5.5 as the content spine, escalating in gravity and route difficulty:
    - **Open Claim Space** (training) — forgiving slingshots; teaches gates, boost, trajectory reading.
    - **Dead Iron Belt** (mid) — committed lines, meaningful mistakes, denser routes.
    - **Black Core Field** (deep) — massive wells, speed-to-survive, risky close passes.
- Target 1–2 courses per tier (3–5 total). Tune `G`, masses, capture shells, boost reserve, penalty per tier.
- **Acceptance:** each course is completable; the fast line genuinely requires grazing dead iron; difficulty and visual register escalate clearly across tiers; no impossible sections; PB chasing feels rewarding.

---

## 8. Resolved Decisions (index)

Every previously-open question is now committed. Fallbacks live with each decision in-line.

| # | Topic | Decision | Section |
| --- | --- | --- | --- |
| 1 | Rotation model | Torque-based + light angular damping | §2.1.1 |
| 2 | Physics architecture | Hand-rolled fixed-timestep gravity + Rapier swept collision | §6.1 |
| 3 | Ghost storage | WR-only blob per course | §2.6.1 |
| 4 | Ordinary asteroids | Collidable obstacles (not cosmetic) — reading the field is a design pillar | §2.2 |
| 5 | Boost | Fixed per-course reserve, multiplier on thrust, no regen | §2.5 |
| 6 | Player identity | 3-char tag + optional display name | §1.2 |
| 7 | Anti-cheat | Edge-function ghost replay validation | §2.8 |
| 8 | Main screen | Unified course-select + timing board (1/3–2/3 split) | §1.2 |
| 9 | Race start | Countdown on fresh entry; thrust-triggered on re-run | §1.3 |

---

## 9. Hard Constraints (non-negotiable for the game to function)

- **Single-player time trial only.** No live opponents, no NPCs, no AI pilots, no networked/real-time multiplayer. The only "other ships" in a race are non-colliding visual ghosts (§2.6). Competition is asynchronous, expressed entirely through the timing board (§1.6).
- **Asteroids are static.** No moving bodies, no N-body among asteroids. Determinism depends on it.
- **Fixed-timestep physics.** Frame-rate-independent or ghosts/times are meaningless.
- **Continuous collision detection.** Discrete CD will miss at race speeds.
- **Never block the finish screen on network.** Local-first, sync opportunistically.
- **Anon public key only client-side.** Never a service key.

### Permanent design boundaries (lore is texture, not systems)

The lore (§5.5) describes a working-field culture. That culture is **texture for course names, UI styling, depot backdrop, and flavor text — not gameplay systems.** The following appear in the fiction but are **permanently out of scope** for Slingshot as designed — they are not deferred features, they are things this game is deliberately not:

- Mining, cargo, ore collection, or any resource loop.
- Economy, currency, trading, or ship purchasing/upgrades.
- Combat, weapons, or projectiles.
- Enemies, AI pilots, salvage sites, or any dynamic/destructible world entity.
- "Rivalries / wagers / claim crews" as anything beyond flavor — the timing board *is* the rivalry.
- A depot "hub" with interactive systems — the depot is a menu/world backdrop only.

Each would break a hard constraint above (dynamic entities vs. determinism) or fundamentally change what Slingshot is. Reviving any of them means designing a different game, by explicit decision — never inferred from the lore.
