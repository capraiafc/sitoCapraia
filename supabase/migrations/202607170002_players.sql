-- Capraia FC: roster management
-- Prerequisite: 20260717_operator_access.sql, which defines
-- public.is_current_operator() from the authenticated user's JWT.

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 80),
  display_name text generated always as (trim(first_name) || ' ' || trim(last_name)) stored,
  squad_number smallint check (squad_number between 1 and 99),
  position text not null check (position in ('portiere', 'difensore', 'centrocampista', 'attaccante', 'staff')),
  status text not null default 'active' check (status in ('active', 'injured', 'unavailable', 'staff', 'former')),
  birth_year smallint check (birth_year between 1900 and 2100),
  bio text check (bio is null or char_length(bio) <= 2000),
  image_url text check (image_url is null or image_url ~* '^https://'),
  published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.players is
  'Public roster entries. Operator-only writes are enforced by RLS.';

create index if not exists players_public_roster_idx
  on public.players (position, squad_number, last_name)
  where published = true;
create unique index if not exists players_active_squad_number_idx
  on public.players (squad_number)
  where squad_number is not null and status in ('active', 'injured', 'unavailable');

create or replace function public.set_player_updated_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists set_player_updated_fields on public.players;
create trigger set_player_updated_fields
before update on public.players
for each row execute function public.set_player_updated_fields();

alter table public.players enable row level security;

-- Visitors can only see entries intentionally published on the public roster.
drop policy if exists "public can read published players" on public.players;
create policy "public can read published players"
on public.players for select
using (published = true);

-- Operators can inspect drafts and have the only write path. The condition is
-- evaluated in Postgres, never trusted from a client-side role flag.
drop policy if exists "operators can read all players" on public.players;
create policy "operators can read all players"
on public.players for select
to authenticated
using ((select public.is_current_operator()));

drop policy if exists "operators can create players" on public.players;
create policy "operators can create players"
on public.players for insert
to authenticated
with check ((select public.is_current_operator()));

drop policy if exists "operators can update players" on public.players;
create policy "operators can update players"
on public.players for update
to authenticated
using ((select public.is_current_operator()))
with check ((select public.is_current_operator()));

drop policy if exists "operators can delete players" on public.players;
create policy "operators can delete players"
on public.players for delete
to authenticated
using ((select public.is_current_operator()));
