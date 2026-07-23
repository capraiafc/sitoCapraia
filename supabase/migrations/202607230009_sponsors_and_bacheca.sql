-- Sponsor e messaggi della bacheca. Richiede public.is_current_operator().

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  annual_amount numeric(10, 2) not null default 0 check (annual_amount >= 0),
  active boolean not null default true,
  logo_background text not null default 'blue-yellow' check (logo_background in ('yellow-white', 'blue-yellow')),
  logo_url text,
  logo_path text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsors_active_sort_idx
  on public.sponsors (active, sort_order, name)
  where active = true;

create or replace function public.set_sponsor_updated_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists set_sponsor_updated_fields on public.sponsors;
create trigger set_sponsor_updated_fields before update on public.sponsors
for each row execute function public.set_sponsor_updated_fields();

alter table public.sponsors enable row level security;

drop policy if exists "public can read active sponsors" on public.sponsors;
create policy "public can read active sponsors" on public.sponsors for select using (active = true);
drop policy if exists "operators can read all sponsors" on public.sponsors;
create policy "operators can read all sponsors" on public.sponsors for select to authenticated using ((select public.is_current_operator()));
drop policy if exists "operators can create sponsors" on public.sponsors;
create policy "operators can create sponsors" on public.sponsors for insert to authenticated with check ((select public.is_current_operator()));
drop policy if exists "operators can update sponsors" on public.sponsors;
create policy "operators can update sponsors" on public.sponsors for update to authenticated using ((select public.is_current_operator())) with check ((select public.is_current_operator()));
drop policy if exists "operators can delete sponsors" on public.sponsors;
create policy "operators can delete sponsors" on public.sponsors for delete to authenticated using ((select public.is_current_operator()));

grant select on public.sponsors to anon;
grant select, insert, update, delete on public.sponsors to authenticated;

create table if not exists public.bacheca_messages (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'Tifoso' check (char_length(btrim(display_name)) between 1 and 80),
  message text not null check (char_length(btrim(message)) between 1 and 280),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bacheca_messages_public_idx
  on public.bacheca_messages (created_at desc)
  where published = true;

create or replace function public.set_bacheca_message_updated_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_bacheca_message_updated_fields on public.bacheca_messages;
create trigger set_bacheca_message_updated_fields before update on public.bacheca_messages
for each row execute function public.set_bacheca_message_updated_fields();

alter table public.bacheca_messages enable row level security;

drop policy if exists "public can read published bacheca messages" on public.bacheca_messages;
create policy "public can read published bacheca messages" on public.bacheca_messages for select using (published = true);
drop policy if exists "visitors can submit bacheca messages" on public.bacheca_messages;
create policy "visitors can submit bacheca messages" on public.bacheca_messages for insert to anon, authenticated with check (published = false);
drop policy if exists "operators can read all bacheca messages" on public.bacheca_messages;
create policy "operators can read all bacheca messages" on public.bacheca_messages for select to authenticated using ((select public.is_current_operator()));
drop policy if exists "operators can update bacheca messages" on public.bacheca_messages;
create policy "operators can update bacheca messages" on public.bacheca_messages for update to authenticated using ((select public.is_current_operator())) with check ((select public.is_current_operator()));
drop policy if exists "operators can delete bacheca messages" on public.bacheca_messages;
create policy "operators can delete bacheca messages" on public.bacheca_messages for delete to authenticated using ((select public.is_current_operator()));

grant select, insert on public.bacheca_messages to anon;
grant select, insert, update, delete on public.bacheca_messages to authenticated;

-- I loghi allegati vivono nel repository. Il nominativo provvisorio si può
-- correggere direttamente dalla sezione Sponsor dell'area operatori.
insert into public.sponsors (name, logo_url, sort_order)
values
  ('Caffè Negro 1950', 'assets/sponsors/caffe-negro.png', 10),
  ('Causarano & Corti', 'assets/sponsors/causarano-corti.png', 20),
  ('CT Express', 'assets/sponsors/ct-express.png', 30),
  ('Sponsor da nominare', 'assets/sponsors/sponsor-logo.png', 40),
  ('Allegri Paolo Rappresentanze', 'assets/sponsors/allegri-paolo.png', 50),
  ('Paci Paolo Siderurgica', 'assets/sponsors/paci-paolo-siderurgica.png', 60)
on conflict do nothing;
