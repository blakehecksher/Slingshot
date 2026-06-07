-- Slingshot racing leaderboards + ghosts + Friend Heat multiplayer.
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.is_slingshot_race_course(course_id text)
returns boolean
language sql
stable
as $$
  select course_id in (
    -- Active courses from src/game/racing/courseCatalog.ts.
    'wake-primer',
    'needle-wake',
    'blackglass-thread',
    'iron-switchback',
    'core-spiral'
  );
$$;

-- ---------------------------------------------------------------------------
-- Global course leaderboard + top-board ghost replay
-- ---------------------------------------------------------------------------

create table if not exists public.race_leaderboard (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  player_name text not null default 'Anonymous Pilot',
  time_sec double precision not null check (time_sec > 0 and time_sec < 3600),
  splits jsonb not null check (jsonb_typeof(splits) = 'array'),
  ghost jsonb not null check (
    jsonb_typeof(ghost) = 'object'
    and octet_length(ghost::text) < 900000
  ),
  created_at timestamptz not null default now()
);

create index if not exists race_leaderboard_course_time_idx
  on public.race_leaderboard (course_id, time_sec asc, created_at asc);

alter table public.race_leaderboard enable row level security;

drop policy if exists "race leaderboard public read" on public.race_leaderboard;
create policy "race leaderboard public read"
  on public.race_leaderboard
  for select
  to anon, authenticated
  using (true);

drop policy if exists "race leaderboard public insert" on public.race_leaderboard;
create policy "race leaderboard public insert"
  on public.race_leaderboard
  for insert
  to anon, authenticated
  with check (
    public.is_slingshot_race_course(course_id)
    and char_length(player_name) between 1 and 40
    and time_sec > 0
    and time_sec < 3600
    and jsonb_typeof(splits) = 'array'
    and jsonb_array_length(splits) between 1 and 16
    and jsonb_typeof(ghost) = 'object'
    and octet_length(ghost::text) < 900000
  );

grant select, insert on table public.race_leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Friend Heat: private invite-code lobbies, shared heat timer, lobby-best
-- ghost. First implementation is trust-based; authoritative run validation
-- and anti-cheat are deferred.
-- ---------------------------------------------------------------------------

create table if not exists public.friend_heat_lobbies (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  course_id text not null,
  host_name text not null,
  heat_duration_sec integer not null default 300
    check (heat_duration_sec between 60 and 3600),
  status text not null default 'lobby'
    check (status in ('lobby', 'active', 'closed')),
  heat_starts_at timestamptz,
  heat_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists friend_heat_lobbies_invite_idx
  on public.friend_heat_lobbies (invite_code);

create table if not exists public.friend_heat_participants (
  lobby_id uuid not null references public.friend_heat_lobbies(id) on delete cascade,
  player_name text not null,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, player_name)
);

create table if not exists public.friend_heat_runs (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.friend_heat_lobbies(id) on delete cascade,
  course_id text not null,
  player_name text not null,
  time_sec double precision not null check (time_sec > 0 and time_sec < 3600),
  splits jsonb not null check (jsonb_typeof(splits) = 'array'),
  ghost jsonb not null check (
    jsonb_typeof(ghost) = 'object'
    and octet_length(ghost::text) < 900000
  ),
  finished_at timestamptz not null default now()
);

create index if not exists friend_heat_runs_lobby_time_idx
  on public.friend_heat_runs (lobby_id, course_id, time_sec asc, finished_at asc);

alter table public.friend_heat_lobbies enable row level security;
alter table public.friend_heat_participants enable row level security;
alter table public.friend_heat_runs enable row level security;

drop policy if exists "friend heat lobbies read" on public.friend_heat_lobbies;
create policy "friend heat lobbies read"
  on public.friend_heat_lobbies for select to anon, authenticated using (true);

drop policy if exists "friend heat lobbies insert" on public.friend_heat_lobbies;
create policy "friend heat lobbies insert"
  on public.friend_heat_lobbies for insert to anon, authenticated
  with check (
    char_length(invite_code) between 4 and 16
    and public.is_slingshot_race_course(course_id)
    and char_length(host_name) between 1 and 40
    and heat_duration_sec between 60 and 3600
    and status in ('lobby', 'active', 'closed')
  );

drop policy if exists "friend heat lobbies update" on public.friend_heat_lobbies;
create policy "friend heat lobbies update"
  on public.friend_heat_lobbies for update to anon, authenticated
  using (true)
  with check (
    status in ('lobby', 'active', 'closed')
    and heat_duration_sec between 60 and 3600
  );

drop policy if exists "friend heat participants read" on public.friend_heat_participants;
create policy "friend heat participants read"
  on public.friend_heat_participants for select to anon, authenticated using (true);

drop policy if exists "friend heat participants insert" on public.friend_heat_participants;
create policy "friend heat participants insert"
  on public.friend_heat_participants for insert to anon, authenticated
  with check (char_length(player_name) between 1 and 40);

drop policy if exists "friend heat participants update" on public.friend_heat_participants;
create policy "friend heat participants update"
  on public.friend_heat_participants for update to anon, authenticated
  using (true) with check (true);

drop policy if exists "friend heat participants delete" on public.friend_heat_participants;
create policy "friend heat participants delete"
  on public.friend_heat_participants for delete to anon, authenticated using (true);

drop policy if exists "friend heat runs read" on public.friend_heat_runs;
create policy "friend heat runs read"
  on public.friend_heat_runs for select to anon, authenticated using (true);

drop policy if exists "friend heat runs insert" on public.friend_heat_runs;
create policy "friend heat runs insert"
  on public.friend_heat_runs for insert to anon, authenticated
  with check (
    public.is_slingshot_race_course(course_id)
    and char_length(player_name) between 1 and 40
    and time_sec > 0
    and time_sec < 3600
    and jsonb_typeof(splits) = 'array'
    and jsonb_array_length(splits) between 1 and 16
    and jsonb_typeof(ghost) = 'object'
    and octet_length(ghost::text) < 900000
  );

grant select, insert, update, delete on table public.friend_heat_lobbies to anon, authenticated;
grant select, insert, update, delete on table public.friend_heat_participants to anon, authenticated;
grant select, insert on table public.friend_heat_runs to anon, authenticated;

notify pgrst, 'reload schema';
select pg_notification_queue_usage();
