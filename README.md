# Slingshot - Racing Time Trials

Browser-based 3D spaceship racing game about momentum, gravity wells, and clean checkpoint lines. This branch turns the original mining loop into a Dead Iron Racing League: choose a course, launch from the base, fly ordered holographic gates, and race your personal-best ghost.

Specs in `docs/spec/`:

- `gravity-game-vision.md` - what the gravity flight should feel like.
- `slingshot-story-spec.md` - Dead Iron, the field, and the working-field fiction.
- `ship-asset-pipeline.md` - kit-built / full-model / primitive ship visuals.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build
```

## Current loop

1. Choose one of three league courses.
2. Launch from the base after the countdown.
3. Fly through each checkpoint in order.
4. Finish back near the base beacon.
5. Save a local personal best, publish shared runs when Supabase is configured, and race the fastest known hologram ghost.

Mining, combat, cargo economy, hangar, and upgrades still exist in the repo, but the active `racing-time-trials` entrypoint keeps them inactive so runs are comparable.

## Controls

### Xbox controller

| Input | Action |
|---|---|
| Left stick | Roll / pitch |
| Right stick | Look around |
| RT | Forward thrust |
| LT | Brake / reverse |
| LB / RB | Yaw right / left |
| D-pad | Strafe |
| B | Boost |
| X | Cycle ship visual before a race |
| Y / Back | Toggle camera |
| Start | Restart current race |
| D-pad on course screen | Select course |
| A on course screen | Start selected course |

### Keyboard + mouse

| Input | Action |
|---|---|
| Enter | Start selected course |
| 1 / 2 / 3 | Select course |
| R | Restart current course |
| W / S | Thrust forward / brake |
| A / D | Roll left / right |
| Q / E | Yaw left / right |
| Space / Ctrl | Strafe up / down |
| Shift | Boost |
| Mouse (click to capture) | Yaw / pitch |
| Arrow keys | Pitch + yaw alternate |
| C | Camera toggle |
| V | Cycle ship visual before a race |
| P | Tuning panel |
| G | Gamepad debug |
| H | Hide / show controls |

## Race save data

`localStorage["slingshot.racing.save.v1"]` stores selected course, personal bests, split times, recent runs, and best-run ghost samples. `localStorage["slingshot.racing.playerName"]` stores the pilot name from the course screen.

The leaderboard code uses a `LeaderboardProvider` interface. Without Supabase env vars, it stays local-only. With Supabase configured, the game fetches top shared runs per course, shows them on the course screen, and replays the fastest known run as the ghost.

## Supabase shared ghosts

1. In Supabase SQL Editor, run `docs/supabase-racing.sql`.
2. Copy `.env.example` to `.env.local`.
3. Fill in:

```sh
VITE_SUPABASE_URL=https://edzpmcudhalajliacchq.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_key
VITE_SLINGSHOT_PLAYER_NAME=Your Pilot Name
```

Use the publishable key or legacy anon key only. Never put a service-role or secret key in a Vite/browser env var.

## Hosting

Built with Vite to a static bundle. Deploy `dist/` to GitHub Pages or any static host. The Rapier WASM file is bundled.

The GitHub Pages workflow expects these values before it builds:

```sh
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SLINGSHOT_PLAYER_NAME
```

Set `VITE_SUPABASE_URL` and optional `VITE_SLINGSHOT_PLAYER_NAME` as repository variables. Set `VITE_SUPABASE_PUBLISHABLE_KEY` as either a repository variable or secret. Without the Supabase URL/key at build time, Vite compiles the app into local-only mode and the public leaderboard cannot show shared top-10 standings.
