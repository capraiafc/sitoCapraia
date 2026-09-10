-- Libreria loghi squadre per il calendario pubblico.
-- Gli operatori con permesso "Gare e risultati" possono gestirla dall'admin.

BEGIN;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capraia-media',
  'capraia-media',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set public = true,
    file_size_limit = 6291456,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.team_logos (
  id uuid primary key default gen_random_uuid(),
  team_name text not null check (char_length(team_name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  aliases text[] not null default '{}',
  logo_url text not null check (char_length(logo_url) between 1 and 500),
  logo_path text,
  published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_logos_published_name_idx
  on public.team_logos (published, team_name);

create or replace function public.set_team_logo_updated_fields()
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

drop trigger if exists set_team_logo_updated_fields on public.team_logos;
create trigger set_team_logo_updated_fields
before update on public.team_logos
for each row execute function public.set_team_logo_updated_fields();

alter table public.team_logos enable row level security;

drop policy if exists "public can read published team logos" on public.team_logos;
create policy "public can read published team logos"
on public.team_logos for select
using (published = true);

drop policy if exists "match operators can read team logos" on public.team_logos;
create policy "match operators can read team logos"
on public.team_logos for select to authenticated
using ((select public.has_admin_area_access('matches')));

drop policy if exists "match operators can create team logos" on public.team_logos;
create policy "match operators can create team logos"
on public.team_logos for insert to authenticated
with check ((select public.has_admin_area_access('matches')));

drop policy if exists "match operators can update team logos" on public.team_logos;
create policy "match operators can update team logos"
on public.team_logos for update to authenticated
using ((select public.has_admin_area_access('matches')))
with check ((select public.has_admin_area_access('matches')));

drop policy if exists "match operators can delete team logos" on public.team_logos;
create policy "match operators can delete team logos"
on public.team_logos for delete to authenticated
using ((select public.has_admin_area_access('matches')));

grant select on public.team_logos to anon;
grant select, insert, update, delete on public.team_logos to authenticated;

notify pgrst, 'reload schema';

COMMIT;
