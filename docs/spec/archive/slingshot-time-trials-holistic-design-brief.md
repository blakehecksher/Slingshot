# Slingshot - Time Trials Holistic Design Brief

_Status: Draft_
_Created: 2026-05-14 0048_
_Purpose: Give Claude Design a focused brief for turning Slingshot into a cohesive time-trial game experience, from menu flow to cockpit HUD._

---

## Product Direction

Slingshot is now best understood as a browser-based 3D time-trial racing game about momentum, gravity, and precision flight through dangerous asteroid fields.

The original mining, collecting, cargo, and extraction ideas are useful worldbuilding context, but they are not the current product direction. Do not design the game around mining runs, resource collection, economy, cargo return, or base upgrades.

The core game is:

> Choose a ship, choose a course, race through ordered checkpoint gates, use asteroid gravity wells to build and redirect speed, finish as fast as possible, compare against ghosts and leaderboards, then run it again.

The central question remains:

> How close can you get?

The answer is now measured in lap times, split deltas, leaderboard rank, and how aggressively the player can skim gravity wells without wrecking.

---

## What The Game Needs To Become

The current playable branch has the ingredients of a strong prototype:

- deterministic racing courses
- ordered checkpoint gates
- time-trial race states
- local and shared leaderboard support
- ghost replay support
- controller-focused flight
- asteroid gravity as the central mechanic

What is missing is the full game-shaped container around that prototype:

- a start menu
- a strong identity and art direction
- a clean mode/course flow
- ship selection
- cockpit UI
- results screen
- leaderboard and ghost selection
- settings and controller options
- consistent visual language across every screen

This brief is for designing that whole experience.

---

## Design Goal For Claude

Create an interactive visual prototype and implementation handoff for Slingshot as a complete time-trial racing game.

Do not make a marketing landing page. Do not make a generic sci-fi dashboard. Design the actual usable game shell and in-race interface.

The prototype should show how the player moves through the game:

```text
Boot / Start
-> Pilot profile or callsign
-> Main menu
-> Course select
-> Ship select
-> Race cockpit HUD
-> Pause menu
-> Results
-> Leaderboard / ghost selection
-> Settings
-> Back to course select / retry
```

The design should feel like a real game that can be implemented in the existing Three.js/Vite codebase.

---

## Recommended Framing

Use a **hangar hub plus depot terminal** framing.

The player is a racing pilot operating out of a rough asteroid-field depot. The ship is physically present in the hangar. Course selection, leaderboards, race records, ship selection, and settings feel like rugged terminal systems at the depot.

This gives the game a cohesive shell:

- **Main menu:** depot/hangar terminal
- **Course select:** field chart / race board
- **Ship select:** hangar bay with ship preview
- **Leaderboard:** timing board / claim-board terminal
- **Settings:** ship systems panel
- **Cockpit HUD:** in-ship instrumentation
- **Results:** race timing printout / terminal report

The UI should feel practical, worn, and built for repeated use.

---

## Tone And Visual Direction

Slingshot should not feel like clean futuristic racing. It should feel like a dangerous working-field racing scene built out of mining equipment, salvage culture, and rough competition.

Reference sensibility:

- Cowboy Bebop in spirit, not literal anime
- functional ships with jobs
- patched hardware
- worn paint
- exposed thrusters
- industrial race equipment
- old terminals and practical displays
- a field economy that has been repurposed into competition

Palette direction:

- desaturated warm metal
- rust
- off-white
- deep navy
- amber
- black iron
- dirty gray
- muted teal/green instrument accents

Avoid:

- pristine chrome sci-fi
- neon cyberpunk
- generic space opera
- luxury racing gloss
- purple/blue gradient futurism
- giant marketing hero sections
- decorative UI elements that do not imply a function

---

## Core Player Flow

### 1. Start / Boot

The start screen should immediately establish the game identity and tone.

It should feel like powering up a rugged depot terminal or cockpit-adjacent race system, not visiting a website.

Needed elements:

- game title: Slingshot
- current pilot callsign
- primary action: race
- secondary actions: ship select, records, settings
- visible hint of the selected ship or hangar environment
- minimal but strong motion/ambience

Do not use a large explanatory hero block. Let the interface and visuals communicate the game.

### 2. Pilot Identity

The game should have a lightweight sense of player identity.

Needed elements:

- callsign / pilot name
- personal bests
- selected ship
- preferred ghost
- course medals or clear status
- global rank where available

This does not need deep RPG progression. It just needs enough persistence that times and ships feel like they belong to the player.

### 3. Course Select

Course selection is one of the most important screens.

Each course should feel like a real place in the asteroid field, not just a list item.

Each course entry should show:

- course name
- visual thumbnail or 3D preview
- difficulty
- gravity intensity
- asteroid density
- best time
- leaderboard position
- medal targets if used
- selected ghost/rival
- short flavor line
- launch action

Course examples from the current branch:

- **Claim Shakedown** - starter course in safer claim space
- **Dead Iron Sweep** - darker field, denser metallic asteroids, stronger gravity rhythm
- **Black Core Run** - deep-field course with intimidating scale and major gravity wells

The course select screen should make it obvious that different courses test different flight skills.

### 4. Ship Select

For now, this is not a ship builder.

The player chooses which ship to fly. Ships may have different feel, but the design should avoid complicated upgrade/economy assumptions.

Needed elements:

- ship preview
- ship name
- short role/handling description
- handling stats
- class or eligibility information if leaderboards are class-based
- clear locked/unlocked/selected state if needed
- launch with selected ship

Potential ship stat language:

- thrust
- boost
- rotation
- drift
- hull tolerance
- gravity stability

Important leaderboard design question:

If ships have different stats, leaderboards should probably be separated by ship or class. If the game wants one pure global leaderboard per course, ships should be standardized or cosmetic for that mode.

For Claude Design: show a UI pattern that can support either:

- standardized race ships, or
- ship/class-filtered leaderboards

Do not design a full modular ship builder unless presenting it as a future extension.

### 5. Cockpit HUD

The cockpit HUD is the core in-race interface.

It should communicate speed and danger without cluttering the view. It should feel like field equipment, not a sterile overlay.

Needed HUD elements:

- race timer
- checkpoint progress
- next gate indicator
- split delta
- personal best or ghost delta
- speed
- energy / boost
- hull or impact tolerance
- off-screen gate guidance
- gravity danger / well strength
- trajectory minimap
- invalid run / wreck / finish states

The trajectory minimap is a signature feature. It should be visually iconic and readable at a glance:

- local asteroid positions
- predicted curved path
- checkpoint/finish markers
- ghost marker
- danger color coding
- clear safe/yellow/red trajectory language

The HUD should support a first-person cockpit feeling. It can include diegetic panels, instrument vibration, scanline wear, subtle glass distortion, or panel flicker, but readability comes first.

### 6. Pause Menu

Pause should be compact and practical.

Needed actions:

- resume
- restart run
- change course
- change ship
- settings
- quit to menu

It should preserve the game tone without hiding the state of the race entirely.

### 7. Results Screen

The results screen is where the time-trial loop becomes satisfying.

Needed elements:

- final time
- personal best delta
- leaderboard rank
- medal or rating if used
- split breakdown
- checkpoint-by-checkpoint comparison
- ghost comparison
- retry action
- next course action
- choose ghost action
- return to course select

The results screen should teach improvement. The player should understand where they gained or lost time.

### 8. Leaderboards And Ghosts

Leaderboards and ghosts should feel integrated into the depot/racing world.

Needed elements:

- global top 10
- personal best
- selected course
- selected ship/class filter if applicable
- selected ghost
- race against global #1
- race against personal best
- race against nearby rival
- clear empty/loading/error states

Avoid making this feel like a generic web table pasted into the game. It should feel like a timing board or rough racing terminal at the depot.

### 9. Settings

Because this is controller-first browser racing, settings matter.

Needed settings:

- controller layout
- stick sensitivity
- invert pitch/yaw
- vibration strength
- camera shake strength
- HUD scale
- minimap size
- ghost opacity
- graphics quality
- fullscreen
- audio sliders
- reduced motion
- colorblind-safe danger colors

Settings should be grouped clearly and optimized for quick adjustment.

---

## Environmental Settings

Even as a time-trial game, the courses need strong environmental identity.

### Open Claim Space

Low gravity, safer, wider routes, sparse asteroid clusters.

Use for starter courses and training.

Visual notes:

- clearer starfield
- fewer hazards
- depot/base visible in distance
- smaller rocks
- lighter dust
- warmer instrument colors

Gameplay feeling:

- learn gates
- learn boost
- learn trajectory minimap
- forgiving slingshots

### Dead Iron Belt

Moderate to high gravity, darker asteroids, richer course rhythm.

Visual notes:

- blue-black metallic seams
- red-orange fissures
- captured debris
- dusty rings
- more intense light contrast
- industrial checkpoint hardware

Gameplay feeling:

- committed slingshot lines
- meaningful mistakes
- denser route reading

### Black Core Field

Deep-field racing around massive gravity wells.

Visual notes:

- huge ancient asteroids
- black metallic cores
- glassy scars
- oppressive scale
- dimmer ambient light
- stronger rumble/vibration language
- warning glows and unstable dust

Gameplay feeling:

- speed required to survive
- risky close passes
- intense split-second trajectory decisions

---

## Race Hardware And Checkpoint Gates

Checkpoint gates should not feel like clean arcade rings.

They should look like rugged navigation and race equipment adapted from mining hardware:

- beacon struts
- bolted emitter nodes
- amber/green signal lights
- worn metal frames
- holographic center ring
- warning strobes
- antenna fins
- maintenance markings
- visible power modules

Gate readability matters:

- required gate should be unmistakable
- upcoming gates should be visible but secondary
- passed gates should fade clearly
- off-screen guidance should share the required-gate color language

Current gameplay color language:

- active/required gate: green
- upcoming gates: amber
- passed gates: faint neutral

Claude may refine this, but the final design must keep active vs upcoming vs passed states immediately readable.

---

## Ships

Ships should be selectable racing craft built from the same worn working-field design language.

They are not luxury racecars. They are repurposed field ships, custom runners, stripped claim craft, and dangerous homebuilt machines.

Good ship signals:

- oversized maneuvering thrusters
- exposed reaction-control clusters
- reinforced nose cages
- external engine pods
- radiator fins
- sensor booms
- patched armor
- worn paint
- visible cable runs
- asymmetric repairs
- clear silhouette from chase/cockpit context

Avoid:

- generic fighter jets
- smooth chrome ships
- ornamental wings with no function
- designs that do not show how the ship turns, boosts, or survives stress

Potential ship archetypes:

- **Scrapper** - balanced starter craft, patched and reliable
- **Needle Runner** - light, fast, twitchy, fragile
- **Tug Frame** - heavy, stable, slower rotation, strong boost line
- **Survey Cutlass** - precise handling, strong instruments, moderate thrust
- **Blackline Special** - advanced racing craft, aggressive boost, low forgiveness

---

## Implementation Context

The current project is a browser game built with:

- Vite
- TypeScript
- Three.js
- Rapier physics

Existing systems include:

- asteroid generation
- gravity sampling
- racing courses
- checkpoint gates
- race manager
- local save data
- Supabase leaderboard support
- ghost replay
- minimap
- trajectory prediction
- ship visuals
- controller input

Claude's output should be implementable as:

- DOM/CSS game UI overlays
- Three.js scene styling
- course thumbnails or preview scenes
- HUD layout
- material palettes
- checkpoint/gate visual direction
- ship select presentation
- settings screens

Do not require a backend redesign. Do not assume a complex economy or full ship-builder system.

---

## Requested Claude Design Deliverables

Produce an interactive prototype that includes:

1. Start / boot screen
2. Main menu
3. Pilot/callsign treatment
4. Course select
5. Ship select
6. Cockpit racing HUD
7. Pause menu
8. Results screen
9. Leaderboard and ghost selection
10. Settings
11. A cohesive visual system tying these screens together

Also include an implementation handoff with:

- UI layout specs
- color palette
- typography direction
- component states
- HUD states
- checkpoint state styling
- course thumbnail/preview guidance
- ship card/preview guidance
- motion/animation notes
- Three.js material and lighting notes where relevant

---