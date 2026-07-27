-- Dati gestionali riservati della rosa e registro idempotente dei reminder.
-- Email e scadenze mediche non vengono aggiunte alla tabella pubblica players.

create table if not exists public.player_private_details (
  player_id uuid primary key references public.players(id) on delete cascade,
  kit_size text check (kit_size is null or char_length(trim(kit_size)) <= 40),
  email text check (
    email is null
    or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  medical_exam_expiry date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.player_private_details is
  'Dati amministrativi riservati della rosa. Non esposti ai visitatori.';

create index if not exists player_private_medical_expiry_idx
  on public.player_private_details (medical_exam_expiry)
  where medical_exam_expiry is not null;

create or replace function public.set_player_private_updated_fields()
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

drop trigger if exists set_player_private_updated_fields on public.player_private_details;
create trigger set_player_private_updated_fields
before update on public.player_private_details
for each row execute function public.set_player_private_updated_fields();

alter table public.player_private_details enable row level security;
revoke all on table public.player_private_details from anon;
grant select, insert, update, delete on table public.player_private_details to authenticated;

drop policy if exists "players operators can read private details" on public.player_private_details;
create policy "players operators can read private details"
on public.player_private_details for select to authenticated
using ((select public.has_admin_area_access('players')));

drop policy if exists "players operators can create private details" on public.player_private_details;
create policy "players operators can create private details"
on public.player_private_details for insert to authenticated
with check ((select public.has_admin_area_access('players')));

drop policy if exists "players operators can update private details" on public.player_private_details;
create policy "players operators can update private details"
on public.player_private_details for update to authenticated
using ((select public.has_admin_area_access('players')))
with check ((select public.has_admin_area_access('players')));

drop policy if exists "players operators can delete private details" on public.player_private_details;
create policy "players operators can delete private details"
on public.player_private_details for delete to authenticated
using ((select public.has_admin_area_access('players')));

create table if not exists public.player_medical_reminder_events (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  medical_exam_expiry date not null,
  reminder_days smallint not null check (reminder_days in (10, 30)),
  recipient_emails text[] not null default '{}',
  sent_at timestamptz not null default now(),
  unique (player_id, medical_exam_expiry, reminder_days)
);

comment on table public.player_medical_reminder_events is
  'Registro dei reminder visita medica già inviati; impedisce invii duplicati.';

create index if not exists player_medical_reminder_events_sent_idx
  on public.player_medical_reminder_events (sent_at desc);

alter table public.player_medical_reminder_events enable row level security;
revoke all on table public.player_medical_reminder_events from anon;
grant select on table public.player_medical_reminder_events to authenticated;

drop policy if exists "players operators can read medical reminders" on public.player_medical_reminder_events;
create policy "players operators can read medical reminders"
on public.player_medical_reminder_events for select to authenticated
using ((select public.has_admin_area_access('players')));

