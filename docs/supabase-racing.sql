-- Slingshot racing leaderboards + ghosts.
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

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
    course_id in ('claim-shakedown', 'dead-iron-sweep', 'black-core-run')
    and char_length(player_name) between 1 and 40
    and time_sec > 0
    and time_sec < 3600
    and jsonb_typeof(splits) = 'array'
    and jsonb_array_length(splits) between 1 and 16
    and jsonb_typeof(ghost) = 'object'
    and octet_length(ghost::text) < 900000
  );

grant select, insert on table public.race_leaderboard to anon, authenticated;
