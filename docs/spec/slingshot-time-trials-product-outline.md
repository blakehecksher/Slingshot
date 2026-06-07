# Slingshot Time Trials - Product Outline

_Status: active_
_Last updated: 2026-05-21 2335_

## One-line concept

Slingshot is a browser-based 3D time-trial racing game about momentum, gravity, and precision flight through dangerous asteroid fields.

## Current product direction

The current game direction is focused on getting players into courses quickly and making the gravity-racing loop strong.

The active game is not centered on ship collecting, hangar management, mining, cargo, economy, combat, or story progression. Those ideas can remain as worldbuilding or future context, but they should not steer the current build.

The companion lore and aesthetic reference is `docs/spec/slingshot-lore-and-visual-direction.md`.

## Core loop

1. Enter callsign.
2. Pick a course.
3. Race through ordered checkpoint gates.
4. Use asteroid gravity wells to gain speed and bend the route.
5. Finish as fast as possible.
6. Compare against personal bests, splits, ghosts, and leaderboards.
7. Retry.

## Screen and scene map

The game should be organized around a fast loop into racing. Screens should support course choice, readable improvement, and quick retry. Avoid slow hub navigation, deep ship management, or menu structures that delay the next run.

### Primary flow

```text
Boot / title
-> Course select
-> Countdown
-> Race HUD
-> Finish / results
-> Retry or course select
```

### Required screens and states

#### 1. Boot / Title

Purpose: Establish identity and tone, then get out of the way.

Needed elements:

- `Slingshot` title.
- Current callsign or quick callsign entry.
- Primary action: race.
- Secondary actions: settings, records.
- Background should show the game world or race field tone, not a marketing hero.
- Should feel like powering up field timing equipment, a cockpit terminal, or a depot race board.

Notes:

- This can be very short on repeat visits.
- The first screen may effectively merge title and course select if that gets players racing faster.

#### 2. Course Select / Race Board

Purpose: The main menu of the game. Pick a course, understand the challenge, see records, launch quickly.

Needed elements:

- Course list or course cards.
- Course name and short field-style description.
- Difficulty.
- Gravity intensity.
- Asteroid density.
- Best time.
- Leaderboard preview.
- Selected ghost/rival if available.
- Launch action.
- Callsign visible/editable without leaving the screen.

Notes:

- This is the most important non-race screen.
- It should feel like a claim-board/timing-board terminal, not a generic level select.
- Course flavor should help memory, but not slow down launch.

#### 3. Countdown / Launch

Purpose: Transition from menu intent into physical racing.

Needed elements:

- Clear `3-2-1-GO` countdown.
- Course name.
- Ghost target indicator if active.
- Camera and audio ramp-up.
- Controls locked until launch.

Notes:

- The existing countdown is important and should feel large, physical, and legible.

#### 4. Race HUD

Purpose: The main play scene.

Needed elements:

- Race timer.
- Current gate and gate count.
- Next gate guidance.
- Speed.
- Boost/energy.
- Hull or impact tolerance.
- Split delta.
- Personal best or ghost delta.
- Trajectory prediction or equivalent field-readable guidance.
- Gravity danger/readability.
- Ghost ship when active.
- Invalid, wreck, finish, and reset states.

Notes:

- The HUD should serve decisions at speed.
- Avoid a persistent minimap. It adds render/HUD cost without enough racing value; prefer in-world gate, field, ghost, and optional debug trajectory cues.

#### 5. Pause Menu

Purpose: Stop without losing context.

Needed elements:

- Resume.
- Restart run.
- Change course.
- Settings.
- Quit to title/course select.
- Current run context remains visible or implied.

Notes:

- Keep it compact and practical.
- No deep hub behavior.

#### 6. Finish / Results

Purpose: Convert the run into learning and another attempt.

Needed elements:

- Final time.
- Personal best result.
- Leaderboard rank or submission state.
- Player leaderboard time.
- Number-one leaderboard time.
- Deltas from the finished run against personal best, player leaderboard time, and number-one leaderboard time.
- Split breakdown.
- Retry as primary action.
- Title/course board as secondary action.

Notes:

- This screen should teach improvement.
- It should answer: how fast was this run, how does it compare against my best, and how does it compare against the board.
- Do not include a separate ghost-selection/results branch.

#### 7. Records / Leaderboards

Purpose: Browse times and choose a target.

Needed elements:

- Selected course.
- Global top 10 where available.
- Personal best.
- Recent runs.
- Ghost availability.
- Choose personal best ghost.
- Choose top public ghost.
- Empty/loading/error states.

Notes:

- This can be embedded into course select at first.
- Avoid making it feel like a web table pasted over the game.

#### 8. Settings

Purpose: Let players tune precision controls and readability.

Needed elements:

- Controller layout.
- Stick sensitivity.
- Invert pitch/yaw.
- Vibration strength.
- Camera shake strength.
- HUD scale.
- Ghost opacity.
- Audio levels.
- Graphics quality.
- Fullscreen.
- Reduced motion.
- Colorblind-safe danger colors.

Notes:

- Settings should be reachable before and during racing.
- Any setting that changes leaderboard fairness should be clearly categorized later if assists are added.

#### 9. Wreck / Invalid Run State

Purpose: Make failure clear and restart fast.

Needed elements:

- Cause: wrecked, missed gate, invalid route, reset.
- Run time at failure.
- Retry.
- Course select.
- Optional quick tip if the failure was obvious.

Notes:

- This may be an overlay state inside Race HUD rather than a full screen.
- Do not make failure slow.

### Deferred or optional screens

These can exist later, but should not block the current core loop:

- Full profile screen.
- Ship select.
- Hangar scene.
- Ship builder.
- Upgrade screen.
- Career/campaign map.
- Story/codex.
- Economy/store.
- Friend Heat multiplayer lobby.

### Scene priorities

1. Course select / race board.
2. Race HUD.
3. Results and retry.
4. Settings.
5. Records/leaderboards/ghosts.
6. Boot/title polish.
7. Pause and failure overlays.

## Priority stack

1. Flight feel
2. Gravity slingshot mechanic
3. Courses
4. Checkpoint gates
5. Timer, splits, and personal bests
6. Ghosts
7. Leaderboards
8. Fast course select
9. Results and retry flow
10. HUD and race readability
11. Course identity and visual clarity
12. Input and settings
13. Light player identity
14. Friend Heat multiplayer mode
15. Lore, tone, and visual direction

---

## 1. Flight Feel

### Current thinking

Moment-to-moment flight is the foundation of the game. The ship needs to feel precise, readable, fast, and recoverable enough that players blame their line instead of the controls.

### Ideas

- Tune thrust, reverse, boost, drift, and rotation around time-trial control rather than simulation purity.
- Preserve controller-first play.
- Keep the ship baseline standardized for comparable leaderboard times unless a future decision says otherwise.

### Open questions

- How arcade-like should braking/reverse feel?
- How punishing should impacts be during early courses?
- Should boost be a scarce resource, a heat-management system, or mostly a rhythm tool?

### Decisions

- Comparable time-trial racing is the active priority.

### Implementation notes

- Current branch already supports controller flight, boost, reverse thrust, yaw, strafe, and maneuver plumes.

---

## 2. Gravity Slingshot Mechanic

### Current thinking

Asteroid gravity is the signature mechanic. The player should read gravity wells, skim danger zones, and use the pull to gain or redirect speed.

### Ideas

- Make gravity readable through trajectory prediction when useful, in-world route cues, screen/audio feedback, and asteroid visual treatment.
- Reward close passes without making every optimal line invisible or unintuitive.
- Courses should be designed around distinct gravity rhythms.

### Open questions

- What is the best visual language for gravity strength?
- Should the player get warning bands around dangerous wells?
- How much should course design force gravity use versus simply reward it?

### Decisions

### Implementation notes

- Current branch has custom asteroid gravity, trajectory prediction, in-world route/gate cues, and course-specific asteroid tuning.

---

## 3. Courses

### Current thinking

Courses are the main content. Each course should test a specific flight skill and create a strong replay loop.

### Ideas

- Starter course: open, forgiving, teaches gates and boost.
- Technical course: denser field, sharper route choices.
- High-gravity course: large wells, speed commitment, risky close passes.
- Later courses can be short, medium, long, or expert variants.

### Open questions

- How many courses are needed for a satisfying first public version?
- Should courses have medal targets?
- Should courses unlock sequentially or all be available immediately?

### Decisions

### Implementation notes

- Current onboarding courses are Clear Line, Drift Yard, Boost Run, Soft Pull, and Hook Pass.
- Current race courses after onboarding are Claim Shakedown, Dead Iron Sweep, and Black Core Run.

---

## 4. Checkpoint Gates

### Current thinking

Gates define the race route. They need to be readable at speed, satisfying to pass through, and unmistakable about the required order.

### Ideas

- Active gate should be visually dominant.
- Upcoming gates should help route planning without competing with the active gate.
- Passed gates should fade clearly.
- Finish gate should feel distinct.

### Open questions

- Should missed gates invalidate immediately or allow recovery?
- Should gates have ideal-line indicators?
- How much physical hardware should gates have versus holographic readability?

### Decisions

### Implementation notes

- Current color language: active/required gate is green, upcoming gates are amber, passed gates are faint neutral.

---

## 5. Timer, Splits, And Personal Bests

### Current thinking

The time-trial loop depends on clear feedback around current run, personal best, and where time was gained or lost.

### Ideas

- Show current time, PB, and live delta.
- Show checkpoint split deltas.
- Make results teach the player where the run improved or fell apart.

### Open questions

- Should split deltas compare against PB, selected ghost, or both?
- Should invalid runs keep split data for learning?
- Should medal targets be visible during the race?

### Decisions

### Implementation notes

- Current branch persists personal bests, recent runs, splits, and ghosts in local storage.

---

## 6. Ghosts

### Current thinking

Ghosts are one of the strongest retention tools because they make improvement visible and give the player a target.

### Ideas

- Always support personal-best ghost.
- Use the top leaderboard run as the default public ghost when available.
- Later support nearby rival ghosts.

### Open questions

- How should the player choose a ghost?
- How visible should ghosts be in dense asteroid fields?
- Should ghosts show split position markers or only ship replay?

### Decisions

### Implementation notes

- Current ghosts replay as translucent hologram ships using fixed-interval transform samples.

---

## 7. Leaderboards

### Current thinking

Leaderboards give the course loop stakes. Keep them simple and course-focused.

### Ideas

- Course top 10.
- Player's personal best.
- Global rank where available.
- Daily or weekly boards can come later.

### Open questions

- Do we need anti-cheat or validation before public sharing?
- Should leaderboard rows expose ghost availability?
- Should there be separate boards for invalid/assist modes if settings change core difficulty?

### Decisions

- Avoid ship/class-filtered boards unless ships materially affect performance.

### Implementation notes

- Current branch supports local-first results and optional Supabase shared standings/ghosts.

---

## 8. Fast Course Select

### Current thinking

Course select should replace most of the hangar/ship-selection burden. The player should be able to race within seconds.

### Ideas

- Callsign input.
- Course list.
- Best time and leaderboard preview.
- Launch action.
- Ghost target selection if simple enough.

### Open questions

- Should the first screen be course select directly?
- How much flavor can course cards carry without slowing launch?
- Should course select show a live 3D preview or static thumbnail?

### Decisions

- Do not make ship selection a major loop for the current direction.

### Implementation notes

- Current start screen already presents courses and top-10 leaderboard.

---

## 9. Results And Retry Flow

### Current thinking

The results screen should make players want one more run.

### Ideas

- Final time.
- Personal best delta.
- Leaderboard rank.
- Split breakdown.
- Retry as the primary action.
- Change course and choose ghost as secondary actions.

### Open questions

- How detailed should split breakdown be on the first version?
- Should the game immediately offer "race your new ghost" after a PB?
- Should the results screen show route mistakes or only timing data?

### Decisions

### Implementation notes

---

## 10. HUD And Race Readability

### Current thinking

The HUD should serve racing decisions and keep the world readable at speed.

### Ideas

- Timer.
- Current gate.
- Speed.
- Boost/energy.
- Hull/damage.
- Split delta.
- Trajectory prediction or in-world route guidance.
- Gravity danger.
- Off-screen gate guidance.

### Open questions

- Which HUD elements are always visible versus toggleable?
- How much trajectory guidance should be visible during normal racing versus debug/tuning?
- How should invalid, wreck, and finish states interrupt the HUD?

### Decisions

### Implementation notes

- Current HUD/status can show race time, current gate, best time, split delta, energy, hull, and state when panels are toggled on.

---

## 11. Course Identity And Visual Clarity

### Current thinking

Courses need visual identity so players remember them, but clarity must beat decoration.

The broad aesthetic is a dangerous working-field racing scene built out of mining equipment, salvage culture, and rough competition. The game should not feel like clean futuristic racing, luxury racing gloss, neon cyberpunk, or generic space opera.

### Ideas

- Claim Shakedown: open, safer, warmer, beginner-friendly.
- Dead Iron Sweep: dense metallic asteroids, red-orange fissures, committed slingshot lines.
- Black Core Run: deep field, large gravity wells, intimidating scale.
- Reference sensibility: Cowboy Bebop in spirit, functional ships with jobs, patched hardware, worn paint, exposed thrusters, industrial race equipment, old terminals, practical displays, and a field economy repurposed into competition.
- Palette direction: desaturated warm metal, rust, off-white, deep navy, amber, black iron, dirty gray, and muted teal/green instrument accents.

### Open questions

- How distinct should each course biome be?
- Should courses include depot/base landmarks, or keep the race field clean?
- What visual treatment best communicates asteroid mass?

### Decisions

### Implementation notes

---

## 12. Input And Settings

### Current thinking

Settings matter because this is a precision controller-first racing game.

### Ideas

- Controller layout.
- Stick sensitivity.
- Invert pitch/yaw.
- Vibration strength.
- Camera shake strength.
- HUD scale.
- Ghost opacity.
- Graphics quality.
- Fullscreen.
- Audio sliders.
- Reduced motion.
- Colorblind-safe danger colors.

### Open questions

- What settings are required before public playtesting?
- Should keyboard/mouse be fully supported or treated as secondary?
- Should assist options invalidate leaderboard submission?

### Decisions

### Implementation notes

---

## 13. Light Player Identity

### Current thinking

The game needs just enough player identity to make records feel owned.

### Ideas

- Callsign.
- Personal bests.
- Recent runs.
- Preferred ghost.
- Course status.

### Open questions

- Should callsign be required before the first race?
- Should the player have a simple profile screen, or should identity stay embedded in course select/results?

### Decisions

### Implementation notes

- Current branch has an editable pilot name and submits finished runs with that name.

---

## 14. Friend Heat Multiplayer Mode

### Current thinking

Friend Heat is a future private multiplayer race mode for invite-code lobbies. It should feel like a short live rivalry between friends without requiring real-time networked racing physics.

Players join a private lobby, ready up, start the same course at nearly the same time, and race within a fixed heat window such as two, three, or five minutes. During the heat, players can restart and keep attempting the same course until the heat timer expires. Once the heat timer reaches zero, no new attempts can start, but attempts already in progress may finish.

### Ideas

- Use invite codes or invite links rather than account-based friend lists.
- Keep all pilots on the same course and heat timer.
- Let the first valid completed run in the lobby become the initial lobby-best ghost.
- Replace the lobby-best ghost whenever another lobby player finishes a faster valid run.
- Apply new lobby-best ghosts only when a player starts their next attempt, not mid-attempt.
- Do not show the global top-board ghost inside Friend Heat.
- For the first version, do not show personal-best ghosts inside Friend Heat; the lobby-best run is the only ghost target.
- Continue submitting every valid completed Friend Heat run to normal personal records and the global course leaderboard.
- Let a Friend Heat run become the global top run if it beats the public leaderboard.
- Treat cheating prevention as out of scope for the first version; this mode is primarily for friendly private races.

### Open questions

- What default heat length should the first version use?
- Should the host choose heat length, course, and restart rules, or should the first version keep those fixed?
- Should lobby participants see live standings during the heat, only between attempts, or only on the final results screen?
- Should late joiners be allowed before the heat starts only, or can they spectate/join mid-heat later?
- Should the lobby-best ghost have its own visual color distinct from personal-best and global ghosts?

### Decisions

- Friend Heat uses private invite-code lobbies.
- Friend Heat does not preload the global top-board ghost.
- The first version should use only the current lobby-best ghost as its in-heat ghost target.
- Lobby-best ghost updates are applied at the start of the player's next attempt, not during the current attempt.
- Once the heat timer expires, no new attempts can start; already-started attempts may finish and count.
- Valid Friend Heat completions still submit to personal records and the global course leaderboard.

### Implementation notes

- The existing fixed-interval ghost sample format is a good fit for lobby-best replay.
- The existing Supabase leaderboard path can be extended with lobby, heat, participant, and lobby-run records.
- A completed run should be representable once while feeding multiple views: personal bests, global course standings, and optional lobby heat standings.
- Realtime updates can use Supabase Realtime or periodic polling; the game only needs to load new lobby-best ghost data before the next attempt.

---

## 15. Lore, Tone, And Visual Direction

### Current thinking

Lore and aesthetics are active development inputs, not a separate story campaign. They should make the racing loop more readable, memorable, and specific.

The field contains Dead Iron, a rare gravitational material that explains why certain asteroids create powerful gravity wells. The racing scene grows out of a rough working-field culture: mining equipment, salvage hardware, depot terminals, timing boards, patched ships, and pilots competing over who can fly closest to danger.

### Ideas

- Keep Dead Iron as the explanation for gravity-rich asteroids.
- Use lore to justify course identity and asteroid visual language.
- Make UI feel like practical field equipment and timing systems, not a generic web dashboard.
- Use names that sound workmanlike: Dead Iron, heavy rock, well field, hot pass, soft capture, deep run, claim rock, ghost line.
- Use sound and vibration as part of the fiction: hull groan, low rumble, warning tones, and pressure near strong wells.

### Open questions

- How much of the Dead Iron lore should appear in-game versus remain behind the scenes?
- Should course descriptions explicitly mention Dead Iron, or should the visuals carry it?
- Should the race organization have a name, or should the scene remain informal/local?

### Decisions

- `docs/spec/slingshot-lore-and-visual-direction.md` is the active lore and aesthetic direction companion to this product outline.

### Implementation notes

- Pull visual and naming details from `docs/spec/slingshot-lore-and-visual-direction.md` when designing courses, gates, HUD, UI, ships, audio, and results screens.

---

## 16. Deferred / Not Current Scope

These ideas are not deleted, but they should not drive the current time-trial build.

- Ship selection as a major loop.
- Hangar hub.
- Ship upgrades.
- Modular ship building.
- Mining.
- Cargo/economy.
- Combat.
- Base upgrades.
- Story progression.
- Extraction runs.

### Notes

- Ship visuals still matter, but ship choice should not become a blocking design pillar right now.
- If different ship stats return later, leaderboard structure must be revisited.
