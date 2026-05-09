# Slingshot — Vision Document

## What This Game Is

A first-person browser-based 3D spaceship game about momentum. You are a pilot flying through a procedurally generated asteroid field, mining resources, managing your energy, evading or fighting enemies, and making it back to base alive and loaded. The asteroid field is not empty space — it is a gravitational landscape. Every asteroid pulls at you. That pull is the central mechanic, the central challenge, and the central pleasure of the game.

---

## The Core Feeling

Speed and control are in tension. You are always either building speed or managing it. The skill of the game is reading a gravitational field and moving through it with intention — not fighting gravity so much as negotiating with it.

The best moment in the game is the slingshot: threading a tight arc around a massive asteroid, feeling the ship strain against the pull, and exiting fast and aimed exactly where you want to go. It should feel like threading a needle at 200mph.

The worst moment — which is also secretly fun — is misjudging it. The rattling starts. The trajectory minimap turns red. You burn everything you have trying to get out and it's not enough.

---

## The World

The map is procedurally generated and alive. Asteroids vary enormously in size and gravitational strength. They rotate slowly about their own centers and drift gradually through space — the field is in motion, not static. Routes that worked five minutes ago may work differently now.

The gravitational landscape creates natural zones:

- **Open space** — low gravity, safe, low resource density. Where the base lives.
- **Mid field** — moderate gravity, moderate resources. Where most early runs happen.
- **Deep field** — dense gravity wells, high resource concentration. The massive central asteroids. Getting there requires skill; getting back out requires more.

The massive deep-field asteroids are the endgame target. Their gravity is strong enough that you cannot approach them slowly — you have to already be moving fast when you enter their pull, or you won't be able to escape. This means you earn access to them not through upgrades but through technique. You sling through smaller wells to build speed, and you ride that speed in and out of the big ones.

---

## Perspective and HUD

The game is played from inside the cockpit — first person. The sense of speed, the rattling of the hull, the sun-flare off an asteroid surface — all of it hits harder from inside. A rich starfield provides orientation reference as the ship rolls and pitches.

In the corner of the screen is a small 3D trajectory minimap — a bird's-eye abstraction of the local field showing asteroid positions, your ship, and your predicted flight path rendered as a curved line. The line updates in real time as you input thrust. It color-codes from green (safe) to yellow (approaching danger) to red (collision course). When a slingshot is set up correctly, the minimap shows your path bending elegantly around an asteroid and pointing outward — a visual confirmation before you feel it in the cockpit.

The HUD is otherwise minimal. A resource counter. An energy indicator. No walls of text.

---

## Energy (Not Fuel)

Your ship has a finite energy supply for thrust. It doesn't feel punishing — it feels like a shaping constraint. A careful, skilled run never runs dry. An aggressive one — fighting gravity instead of riding it, burning hard through the deep field — creates a real question about whether you can make it home.

Slingshot navigation is energy-efficient. Using gravity to redirect you instead of thrust is the game teaching you its own best technique.

Scattered through the field are energy pickups. They extend your range and give you a reason to deviate from the straight path home. Running critically low doesn't strand you — a minimum reserve keeps you drifting slowly and steering, enough to make it back if you play it right. The emergency crawl home is its own tense experience.

---

## Resources and the Loop

Asteroids emit resources passively when you are near them. You mine by proximity — skilled navigation is the mining action. The longer and closer you orbit, the more you collect.

When you die, your cargo scatters into floating pickups in space. They persist. An enemy — human or AI — can collect them. So can you, if you respawn and get back there fast enough. Death is punishing but not final, and the recovery mission can be more tense than the original run.

To upgrade your ship, you return to base and trade resources for improvements — speed, hull strength, cargo capacity, energy reserves. The base is in open space, low gravity, deliberately exposed. The return trip is when you're most vulnerable: full cargo, predictable trajectory, everyone knows where you're headed.

The loop: launch → navigate → mine → survive → return → upgrade → go further.

---

## Your Ship

The ship is the game's other main character. You start with something stripped down — minimal engines, no armor, small cargo capacity. It looks the part: bare, functional, a little desperate. Over time, as you trade resources for upgrades at the base, the ship changes visually. Not cosmetically — structurally. A new engine cluster actually appears on the hull. Armor plating gets bolted on. A second cargo pod attaches. Upgraded weapons mount visibly on the frame.

The goal is that you can read another ship's history at a glance. A veteran ship looks busy and specific — layered, scarred, purposeful. A new ship looks stripped. You should be able to look at your own ship in a hangar view at the base and see where you've been putting your resources, what you've prioritized, what kind of pilot you are.

Upgrades are discrete physical things you are adding to the ship, not a skill tree. The categories roughly correspond to the game's core tensions:

- **Engines / Thrust** — how fast you can accelerate, how much you can fight gravity
- **Hull / Armor** — how much punishment you absorb before dying
- **Cargo** — how much you can carry per run
- **Energy** — how deep into the field you can go before needing to turn back
- **Weapons** — what you're carrying into a fight

No upgrade makes the slingshot easier. That stays a skill gate. Upgrades make everything around it more forgiving — longer runs, more resilient ship, bigger payouts when you get deep.

For initial implementation, ships should be built from simple procedural geometry — boxes, cylinders, cones. The modularity matters more than the fidelity. The system should be designed so that better models can be swapped in later without rearchitecting anything. Get the attachment points and upgrade logic right first; the art can follow.

---

## Enemies

AI ships patrol the field. They mine, they fight, they return to base. They are not clever pilots — they won't out-slingshot you — but they are threatening, they go for your cargo when you die, and they create pressure that makes the field feel occupied. A future multiplayer layer would replace or supplement these with real players.

Combat is a gravity problem. Projectiles curve in gravity wells. A skilled player leads shots through the field. Fights near massive asteroids are chaotic, high-speed, and strange.

---

## Aesthetic Direction

The reference point is Cowboy Bebop — not the anime in the literal sense, but the sensibility. Ships in that world are specific and functional. The Swordfish II is a racing ship repurposed for combat. The Bebop itself is a fishing trawler. Nothing looks designed to look cool — it looks like it has a job and has been doing that job for a while. Paint worn at panel edges. Mismatched components. The kind of ship where you can tell what it does before anyone explains it.

Color palette: desaturated and warm. Rust, off-white, deep navy, amber. Not neon space. Not chrome future. The asteroids should feel ancient and heavy. The ships should feel cobbled together and operational.

Whatever blocky, low-poly geometry ends up as the ship model, it should read within that sensibility — functional silhouette, visible engine clusters, nothing decorative that doesn't have a reason to be there.

Sound is load-bearing: the hull stress creak as you push into a gravity well, the subsonic rumble of a massive asteroid's pull, the clean silence of open space. These are the game's feedback system as much as the HUD is. The music direction follows the same reference — something with jazz structure and weight. Not background ambience. Music that has its own momentum.

The shaking and rattling near gravity extremes is physical feedback — screen shake, hull sound, controller vibration. It should feel like the ship is working as hard as you are.

---

## What This Game Is Not

It is not a dogfighting game. Combat exists but the game is about movement.

It is not a base-builder or a slow resource management game. The loop is fast. Runs are short to medium length.

It is not punishing in a way that feels unfair. Death has consequences but the field is navigable and skill is rewarded clearly.

---

## Platform

Browser, desktop first. Built in Three.js with Rapier physics. Single-player to start, with multiplayer as a future architectural layer once the core feel is established.

The game is designed to be played with an Xbox controller. The Web Gamepad API supports this natively in browser — no installation, plug in and play. Left stick for thrust direction, right stick for camera/aim, triggers for boost and brake. Controller vibration is the hardware version of the hull shake. When it's working right, the controller should feel like the ship.

---

## The Question This Game Asks

*How close can you get?*
