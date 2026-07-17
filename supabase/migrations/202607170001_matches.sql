-- Gestione gare Capraia
-- Prerequisito: la migrazione auth deve aver creato public.is_current_operator(),
-- una funzione SECURITY DEFINER che restituisce true solo per operatori attivi.

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  legacy_key text unique,
  season_id text not null check (char_length(season_id) between 4 and 32),
  match_day text not null check (char_length(match_day) between 1 and 80),
  home_team text not null check (char_length(home_team) between 1 and 120),
  away_team text not null check (char_length(away_team) between 1 and 120),
  kickoff_at timestamptz,
  venue text,
  competition text not null check (char_length(competition) between 1 and 160),
  phase text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'postponed', 'cancelled')),
  home_score smallint check (home_score is null or home_score between 0 and 99),
  away_score smallint check (away_score is null or away_score between 0 and 99),
  referee text,
  halftime_score text,
  notes text,
  source_url text,
  extra_info jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completed_matches_have_both_scores check (
    status <> 'completed' or (home_score is not null and away_score is not null)
  )
);

create index if not exists matches_season_kickoff_idx
  on public.matches (season_id, kickoff_at);
create index if not exists matches_public_schedule_idx
  on public.matches (published, kickoff_at)
  where published = true;

create or replace function public.set_match_updated_fields()
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

drop trigger if exists set_match_updated_fields on public.matches;
create trigger set_match_updated_fields
before update on public.matches
for each row execute function public.set_match_updated_fields();

alter table public.matches enable row level security;

-- Il calendario pubblico espone solo le gare pubblicate; campi interni restano
-- nel record perché il frontend pubblico seleziona esplicitamente le colonne.
drop policy if exists "public can read published matches" on public.matches;
create policy "public can read published matches"
on public.matches for select
using (published = true);

drop policy if exists "operators can read all matches" on public.matches;
create policy "operators can read all matches"
on public.matches for select
to authenticated
using ((select public.is_current_operator()));

drop policy if exists "operators can create matches" on public.matches;
create policy "operators can create matches"
on public.matches for insert
to authenticated
with check ((select public.is_current_operator()));

drop policy if exists "operators can update matches" on public.matches;
create policy "operators can update matches"
on public.matches for update
to authenticated
using ((select public.is_current_operator()))
with check ((select public.is_current_operator()));

drop policy if exists "operators can delete matches" on public.matches;
create policy "operators can delete matches"
on public.matches for delete
to authenticated
using ((select public.is_current_operator()));
