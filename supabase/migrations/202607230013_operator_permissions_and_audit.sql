-- Permessi granulari dell'area operatori e storico di accessi/azioni.

alter table public.operator_allowlist
  add column if not exists can_matches boolean not null default false,
  add column if not exists can_players boolean not null default false,
  add column if not exists can_news boolean not null default false,
  add column if not exists can_sponsors boolean not null default false,
  add column if not exists can_bacheca boolean not null default false,
  add column if not exists can_merch boolean not null default false;

insert into public.operator_allowlist (email, role)
values ('capraiafc@gmail.com', 'admin')
on conflict (email) do update set role = 'admin';

create or replace function public.is_super_user()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'capraiafc@gmail.com';
$$;

create or replace function public.has_admin_area_access(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_user() or exists (
    select 1 from public.operator_allowlist o
    where o.email = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and o.role in ('operator', 'admin')
      and case p_area
        when 'matches' then o.can_matches
        when 'players' then o.can_players
        when 'news' then o.can_news
        when 'sponsors' then o.can_sponsors
        when 'bacheca' then o.can_bacheca
        when 'merch' then o.can_merch
        else false
      end
  );
$$;

create or replace function public.current_admin_permissions()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_operator', public.is_current_operator(),
    'is_super_user', public.is_super_user(),
    'matches', public.has_admin_area_access('matches'),
    'players', public.has_admin_area_access('players'),
    'news', public.has_admin_area_access('news'),
    'sponsors', public.has_admin_area_access('sponsors'),
    'bacheca', public.has_admin_area_access('bacheca'),
    'merch', public.has_admin_area_access('merch')
  );
$$;

drop function if exists public.list_operator_emails();
create function public.list_operator_emails()
returns table (email text, role text, created_at timestamptz, can_matches boolean, can_players boolean, can_news boolean, can_sponsors boolean, can_bacheca boolean, can_merch boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  return query select o.email, o.role, o.created_at, o.can_matches, o.can_players, o.can_news, o.can_sponsors, o.can_bacheca, o.can_merch from public.operator_allowlist o order by o.email;
end;
$$;

drop function if exists public.add_operator(text);
drop function if exists public.add_operator(text, boolean, boolean, boolean, boolean, boolean, boolean);
create function public.add_operator(operator_email text, p_can_matches boolean default false, p_can_players boolean default false, p_can_news boolean default false, p_can_sponsors boolean default false, p_can_bacheca boolean default false, p_can_merch boolean default false)
returns table (email text, role text, created_at timestamptz, can_matches boolean, can_players boolean, can_news boolean, can_sponsors boolean, can_bacheca boolean, can_merch boolean)
language plpgsql security definer set search_path = public as $$
declare normalized_email text := lower(trim(operator_email));
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Inserisci un indirizzo email valido.' using errcode = '22023'; end if;
  insert into public.operator_allowlist (email, role, created_by, can_matches, can_players, can_news, can_sponsors, can_bacheca, can_merch)
  values (normalized_email, 'operator', auth.uid(), p_can_matches, p_can_players, p_can_news, p_can_sponsors, p_can_bacheca, p_can_merch)
  on conflict on constraint operator_allowlist_pkey do update set can_matches = excluded.can_matches, can_players = excluded.can_players, can_news = excluded.can_news, can_sponsors = excluded.can_sponsors, can_bacheca = excluded.can_bacheca, can_merch = excluded.can_merch;
  return query select o.email, o.role, o.created_at, o.can_matches, o.can_players, o.can_news, o.can_sponsors, o.can_bacheca, o.can_merch from public.operator_allowlist o where o.email = normalized_email;
end;
$$;

create or replace function public.set_operator_permissions(operator_email text, p_can_matches boolean, p_can_players boolean, p_can_news boolean, p_can_sponsors boolean, p_can_bacheca boolean, p_can_merch boolean)
returns void language plpgsql security definer set search_path = public as $$
declare normalized_email text := lower(trim(operator_email));
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  if normalized_email = 'capraiafc@gmail.com' then raise exception 'Il super user ha sempre accesso a tutte le aree.' using errcode = '22023'; end if;
  update public.operator_allowlist set can_matches = p_can_matches, can_players = p_can_players, can_news = p_can_news, can_sponsors = p_can_sponsors, can_bacheca = p_can_bacheca, can_merch = p_can_merch where email = normalized_email;
  if not found then raise exception 'Operatore non trovato.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.remove_operator(operator_email text)
returns void language plpgsql security definer set search_path = public as $$
declare normalized_email text := lower(trim(operator_email));
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  if normalized_email = 'capraiafc@gmail.com' then raise exception 'Il super user non può essere rimosso.' using errcode = '22023'; end if;
  delete from public.operator_allowlist where email = normalized_email;
end;
$$;

create table if not exists public.admin_login_events (
  id bigint generated always as identity primary key,
  operator_email text not null,
  operator_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists admin_login_events_recent_idx on public.admin_login_events (created_at desc, operator_email);
alter table public.admin_login_events enable row level security;

create table if not exists public.admin_action_events (
  id bigint generated always as identity primary key,
  operator_email text not null,
  operator_id uuid references auth.users(id) on delete set null,
  area text not null,
  action text not null check (action in ('create', 'update', 'delete')),
  entity_id text,
  entity_label text,
  created_at timestamptz not null default now()
);
create index if not exists admin_action_events_recent_idx on public.admin_action_events (created_at desc);
alter table public.admin_action_events enable row level security;

create or replace function public.record_admin_login()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_current_operator() then raise exception 'Accesso negato.' using errcode = '42501'; end if;
  insert into public.admin_login_events (operator_email, operator_id) values (lower(trim(auth.jwt() ->> 'email')), auth.uid());
end;
$$;

create or replace function public.audit_admin_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
declare label text;
begin
  if not public.is_current_operator() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  label := coalesce(row_data ->> 'name', row_data ->> 'title', row_data ->> 'display_name', nullif(concat_ws(' — ', row_data ->> 'home_team', row_data ->> 'away_team'), ''));
  insert into public.admin_action_events (operator_email, operator_id, area, action, entity_id, entity_label)
  values (lower(trim(auth.jwt() ->> 'email')), auth.uid(), tg_argv[0], lower(tg_op), row_data ->> 'id', label);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists audit_matches_changes on public.matches;
create trigger audit_matches_changes after insert or update or delete on public.matches for each row execute function public.audit_admin_change('matches');
drop trigger if exists audit_players_changes on public.players;
create trigger audit_players_changes after insert or update or delete on public.players for each row execute function public.audit_admin_change('players');
drop trigger if exists audit_news_changes on public.news;
create trigger audit_news_changes after insert or update or delete on public.news for each row execute function public.audit_admin_change('news');
drop trigger if exists audit_sponsors_changes on public.sponsors;
create trigger audit_sponsors_changes after insert or update or delete on public.sponsors for each row execute function public.audit_admin_change('sponsors');
drop trigger if exists audit_bacheca_changes on public.bacheca_messages;
create trigger audit_bacheca_changes after insert or update or delete on public.bacheca_messages for each row execute function public.audit_admin_change('bacheca');
drop trigger if exists audit_merch_changes on public.merch_products;
create trigger audit_merch_changes after insert or update or delete on public.merch_products for each row execute function public.audit_admin_change('merch');
drop trigger if exists audit_operator_changes on public.operator_allowlist;
create trigger audit_operator_changes after insert or update or delete on public.operator_allowlist for each row execute function public.audit_admin_change('operators');

create or replace function public.list_admin_login_counts()
returns table (operator_email text, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  return query select e.operator_email, count(*) from public.admin_login_events e where e.created_at >= now() - interval '3 months' group by e.operator_email order by count(*) desc, e.operator_email;
end;
$$;

create or replace function public.list_admin_actions(p_limit integer default 10)
returns table (id bigint, operator_email text, area text, action text, entity_label text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  return query select e.id, e.operator_email, e.area, e.action, e.entity_label, e.created_at from public.admin_action_events e where e.created_at >= now() - interval '3 months' order by e.created_at desc limit greatest(1, least(coalesce(p_limit, 10), 500));
end;
$$;

-- RLS delle aree: il menu non è l'unico controllo.
drop policy if exists "operators can read all matches" on public.matches; create policy "operators can read all matches" on public.matches for select to authenticated using ((select public.has_admin_area_access('matches')));
drop policy if exists "operators can create matches" on public.matches; create policy "operators can create matches" on public.matches for insert to authenticated with check ((select public.has_admin_area_access('matches')));
drop policy if exists "operators can update matches" on public.matches; create policy "operators can update matches" on public.matches for update to authenticated using ((select public.has_admin_area_access('matches'))) with check ((select public.has_admin_area_access('matches')));
drop policy if exists "operators can delete matches" on public.matches; create policy "operators can delete matches" on public.matches for delete to authenticated using ((select public.has_admin_area_access('matches')));

drop policy if exists "operators can read all players" on public.players; create policy "operators can read all players" on public.players for select to authenticated using ((select public.has_admin_area_access('players')));
drop policy if exists "operators can create players" on public.players; create policy "operators can create players" on public.players for insert to authenticated with check ((select public.has_admin_area_access('players')));
drop policy if exists "operators can update players" on public.players; create policy "operators can update players" on public.players for update to authenticated using ((select public.has_admin_area_access('players'))) with check ((select public.has_admin_area_access('players')));
drop policy if exists "operators can delete players" on public.players; create policy "operators can delete players" on public.players for delete to authenticated using ((select public.has_admin_area_access('players')));

drop policy if exists "operators can read all news" on public.news; create policy "operators can read all news" on public.news for select to authenticated using ((select public.has_admin_area_access('news')));
drop policy if exists "operators can create news" on public.news; create policy "operators can create news" on public.news for insert to authenticated with check ((select public.has_admin_area_access('news')));
drop policy if exists "operators can update news" on public.news; create policy "operators can update news" on public.news for update to authenticated using ((select public.has_admin_area_access('news'))) with check ((select public.has_admin_area_access('news')));
drop policy if exists "operators can delete news" on public.news; create policy "operators can delete news" on public.news for delete to authenticated using ((select public.has_admin_area_access('news')));

drop policy if exists "operators can read all sponsors" on public.sponsors; create policy "operators can read all sponsors" on public.sponsors for select to authenticated using ((select public.has_admin_area_access('sponsors')));
drop policy if exists "operators can create sponsors" on public.sponsors; create policy "operators can create sponsors" on public.sponsors for insert to authenticated with check ((select public.has_admin_area_access('sponsors')));
drop policy if exists "operators can update sponsors" on public.sponsors; create policy "operators can update sponsors" on public.sponsors for update to authenticated using ((select public.has_admin_area_access('sponsors'))) with check ((select public.has_admin_area_access('sponsors')));
drop policy if exists "operators can delete sponsors" on public.sponsors; create policy "operators can delete sponsors" on public.sponsors for delete to authenticated using ((select public.has_admin_area_access('sponsors')));

drop policy if exists "operators can read all bacheca messages" on public.bacheca_messages; create policy "operators can read all bacheca messages" on public.bacheca_messages for select to authenticated using ((select public.has_admin_area_access('bacheca')));
drop policy if exists "operators can update bacheca messages" on public.bacheca_messages; create policy "operators can update bacheca messages" on public.bacheca_messages for update to authenticated using ((select public.has_admin_area_access('bacheca'))) with check ((select public.has_admin_area_access('bacheca')));
drop policy if exists "operators can delete bacheca messages" on public.bacheca_messages; create policy "operators can delete bacheca messages" on public.bacheca_messages for delete to authenticated using ((select public.has_admin_area_access('bacheca')));

drop policy if exists "operators can read all merch products" on public.merch_products; create policy "operators can read all merch products" on public.merch_products for select to authenticated using ((select public.has_admin_area_access('merch')));
drop policy if exists "operators can create merch products" on public.merch_products; create policy "operators can create merch products" on public.merch_products for insert to authenticated with check ((select public.has_admin_area_access('merch')));
drop policy if exists "operators can update merch products" on public.merch_products; create policy "operators can update merch products" on public.merch_products for update to authenticated using ((select public.has_admin_area_access('merch'))) with check ((select public.has_admin_area_access('merch')));
drop policy if exists "operators can delete merch products" on public.merch_products; create policy "operators can delete merch products" on public.merch_products for delete to authenticated using ((select public.has_admin_area_access('merch')));

drop policy if exists "operators can read all merch images" on public.merch_product_images; create policy "operators can read all merch images" on public.merch_product_images for select to authenticated using ((select public.has_admin_area_access('merch')));
drop policy if exists "operators can create merch images" on public.merch_product_images; create policy "operators can create merch images" on public.merch_product_images for insert to authenticated with check ((select public.has_admin_area_access('merch')));
drop policy if exists "operators can update merch images" on public.merch_product_images; create policy "operators can update merch images" on public.merch_product_images for update to authenticated using ((select public.has_admin_area_access('merch'))) with check ((select public.has_admin_area_access('merch')));
drop policy if exists "operators can delete merch images" on public.merch_product_images; create policy "operators can delete merch images" on public.merch_product_images for delete to authenticated using ((select public.has_admin_area_access('merch')));

drop policy if exists "operators can read merch order requests" on public.merch_order_requests; create policy "operators can read merch order requests" on public.merch_order_requests for select to authenticated using ((select public.has_admin_area_access('merch')));

revoke all on function public.is_super_user() from public;
revoke all on function public.has_admin_area_access(text) from public;
revoke all on function public.current_admin_permissions() from public;
revoke all on function public.list_operator_emails() from public;
revoke all on function public.add_operator(text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
revoke all on function public.set_operator_permissions(text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
revoke all on function public.remove_operator(text) from public;
revoke all on function public.record_admin_login() from public;
revoke all on function public.list_admin_login_counts() from public;
revoke all on function public.list_admin_actions(integer) from public;
grant execute on function public.is_super_user(), public.has_admin_area_access(text), public.current_admin_permissions(), public.record_admin_login(), public.list_operator_emails(), public.add_operator(text, boolean, boolean, boolean, boolean, boolean, boolean), public.set_operator_permissions(text, boolean, boolean, boolean, boolean, boolean, boolean), public.remove_operator(text), public.list_admin_login_counts(), public.list_admin_actions(integer) to authenticated;
