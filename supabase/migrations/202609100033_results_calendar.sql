-- Calendario Risultati: eseguire dopo le migrazioni precedenti nel SQL Editor.
-- Non modifica né elimina le gare già inserite.
begin;

alter table public.matches
  add column if not exists home_penalties smallint,
  add column if not exists away_penalties smallint;

alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check
  check (status in ('scheduled', 'completed', 'postponed', 'suspended', 'cancelled'));

alter table public.matches drop constraint if exists matches_penalties_check;
alter table public.matches add constraint matches_penalties_check check (
  (home_penalties is null and away_penalties is null)
  or (
    home_penalties is not null and away_penalties is not null
    and home_penalties between 0 and 99 and away_penalties between 0 and 99
    and status = 'completed'
    and home_score is not null and away_score is not null
    and home_score = away_score and home_penalties <> away_penalties
  )
);

comment on column public.matches.kickoff_at is
  'Istante UTC; inserimento e visualizzazione nel fuso Europe/Rome. NULL = data da definire.';
comment on column public.matches.status is
  'scheduled = programmata (anche dopo anticipo/recupero); completed = finale; postponed/suspended = in attesa di riprogrammazione; cancelled = annullata.';
comment on column public.matches.home_penalties is
  'Rigori della serie finale, separati dai gol della gara (inclusi eventuali supplementari). Coppia facoltativa, solo conclusa in parità.';
comment on column public.matches.extra_info is
  'Metadati estendibili: events, home_logo, away_logo, competition_logo. Conservare le chiavi non modificate.';

-- Conferma i permessi dell’area Gare: essere operatore di un’altra area non basta.
alter table public.matches enable row level security;
drop policy if exists "operators can read all matches" on public.matches;
create policy "operators can read all matches" on public.matches for select to authenticated
  using ((select public.has_admin_area_access('matches')));
drop policy if exists "operators can create matches" on public.matches;
create policy "operators can create matches" on public.matches for insert to authenticated
  with check ((select public.has_admin_area_access('matches')));
drop policy if exists "operators can update matches" on public.matches;
create policy "operators can update matches" on public.matches for update to authenticated
  using ((select public.has_admin_area_access('matches')))
  with check ((select public.has_admin_area_access('matches')));
drop policy if exists "operators can delete matches" on public.matches;
create policy "operators can delete matches" on public.matches for delete to authenticated
  using ((select public.has_admin_area_access('matches')));

create index if not exists matches_public_season_status_kickoff_idx
  on public.matches (season_id, status, kickoff_at) where published = true;

notify pgrst, 'reload schema';
commit;
