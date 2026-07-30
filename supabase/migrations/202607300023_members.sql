-- Capraia FC: area Tesserati.
-- I dati personali dei soci restano privati: nessuna policy li espone al web pubblico.

alter table public.operator_allowlist
  add column if not exists can_members boolean not null default false;

create or replace function public.membership_current_season()
returns text
language sql
stable
set search_path = public
as $$
  select case
    when extract(month from (now() at time zone 'Europe/Rome')) >= 7
      then extract(year from (now() at time zone 'Europe/Rome'))::int::text || '-' || (extract(year from (now() at time zone 'Europe/Rome'))::int + 1)::text
    else (extract(year from (now() at time zone 'Europe/Rome'))::int - 1)::text || '-' || extract(year from (now() at time zone 'Europe/Rome'))::int::text
  end;
$$;

create table if not exists public.members (
  -- Il numero tessera è l'identificativo principale richiesto dalla società.
  card_number integer primary key check (card_number between 1 and 999999),
  -- UUID tecnico stabile per RPC e riferimenti interni: non è esposto come
  -- identificativo della tessera.
  id uuid not null unique default gen_random_uuid(),
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 100),
  display_name text generated always as (trim(first_name) || ' ' || trim(last_name)) stored,
  birth_date date,
  birth_place text,
  nationality text,
  tax_code text,
  gender text check (gender is null or gender in ('M', 'F', 'Altro')),
  residence text,
  email text,
  phone text,
  identity_document text,
  identity_document_expiry date,
  experience_feedback text,
  member_since date,
  renewed_current_season boolean not null default false,
  paid boolean not null default false,
  payment_method text,
  renewal_total numeric(10, 2) not null default 0 check (renewal_total >= 0),
  renewal_season text not null default public.membership_current_season()
    check (renewal_season ~ '^[0-9]{4}-[0-9]{4}$'),
  renewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_renewal_data_check check (
    (not renewed_current_season and not paid and renewal_total = 0 and payment_method is null)
    or (renewed_current_season and paid and renewal_total > 0 and nullif(trim(payment_method), '') is not null)
  )
);

create index if not exists members_display_name_idx on public.members (last_name, first_name);
create index if not exists members_renewal_status_idx on public.members (renewal_season, renewed_current_season);
create index if not exists members_birth_date_idx on public.members (birth_date) where birth_date is not null;

create or replace function public.set_member_updated_fields()
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

drop trigger if exists set_member_updated_fields on public.members;
create trigger set_member_updated_fields
before update on public.members
for each row execute function public.set_member_updated_fields();

create table if not exists public.member_renewal_events (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete restrict,
  season text not null check (season ~ '^[0-9]{4}-[0-9]{4}$'),
  amount numeric(10, 2) not null check (amount > 0),
  payment_method text not null check (char_length(trim(payment_method)) between 1 and 80),
  request_id uuid not null unique,
  renewed_by uuid references auth.users(id) on delete set null,
  renewed_at timestamptz not null default now()
);
create index if not exists member_renewal_events_member_idx on public.member_renewal_events (member_id, renewed_at desc);

-- Estende il controllo centralizzato, non solo il menu lato browser.
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
        when 'members' then o.can_members
        else false
      end
  );
$$;

create or replace function public.current_admin_permissions()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_operator', public.is_current_operator(),
    'is_super_user', public.is_super_user(),
    'can_matches', public.has_admin_area_access('matches'),
    'can_players', public.has_admin_area_access('players'),
    'can_news', public.has_admin_area_access('news'),
    'can_sponsors', public.has_admin_area_access('sponsors'),
    'can_bacheca', public.has_admin_area_access('bacheca'),
    'can_merch', public.has_admin_area_access('merch'),
    'can_members', public.has_admin_area_access('members'),
    'player_id', public.current_player_id(),
    'is_player_self_service', public.current_player_id() is not null
  );
$$;

-- Compatibilità con l'attuale pagina Operatori: l'ultimo parametro dei
-- permessi è opzionale e le chiamate precedenti non cancellano can_members.
drop function if exists public.list_operator_emails();
create function public.list_operator_emails()
returns table (
  email text, role text, created_at timestamptz,
  can_matches boolean, can_players boolean, can_news boolean, can_sponsors boolean,
  can_bacheca boolean, can_merch boolean, can_members boolean,
  player_id uuid, player_name text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  return query
    select o.email, o.role, o.created_at, o.can_matches, o.can_players, o.can_news,
      o.can_sponsors, o.can_bacheca, o.can_merch, o.can_members, o.player_id, p.display_name
    from public.operator_allowlist o
    left join public.players p on p.id = o.player_id
    order by o.email;
end;
$$;

drop function if exists public.add_operator(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
create function public.add_operator(
  operator_email text, p_can_matches boolean default false, p_can_players boolean default false,
  p_can_news boolean default false, p_can_sponsors boolean default false, p_can_bacheca boolean default false,
  p_can_merch boolean default false, p_can_members boolean default false
)
returns table (
  email text, role text, created_at timestamptz,
  can_matches boolean, can_players boolean, can_news boolean, can_sponsors boolean,
  can_bacheca boolean, can_merch boolean, can_members boolean,
  player_id uuid, player_name text
)
language plpgsql security definer set search_path = public
as $$
declare normalized_email text := lower(trim(operator_email));
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$' then raise exception 'Inserisci un indirizzo email valido.' using errcode = '22023'; end if;
  insert into public.operator_allowlist (email, role, created_by, can_matches, can_players, can_news, can_sponsors, can_bacheca, can_merch, can_members)
  values (normalized_email, 'operator', auth.uid(), p_can_matches, p_can_players, p_can_news, p_can_sponsors, p_can_bacheca, p_can_merch, p_can_members)
  on conflict (email) do update set
    can_matches = excluded.can_matches, can_players = excluded.can_players, can_news = excluded.can_news,
    can_sponsors = excluded.can_sponsors, can_bacheca = excluded.can_bacheca, can_merch = excluded.can_merch,
    can_members = excluded.can_members;
  return query
    select o.email, o.role, o.created_at, o.can_matches, o.can_players, o.can_news,
      o.can_sponsors, o.can_bacheca, o.can_merch, o.can_members, o.player_id, p.display_name
    from public.operator_allowlist o left join public.players p on p.id = o.player_id where o.email = normalized_email;
end;
$$;

drop function if exists public.set_operator_permissions(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
create function public.set_operator_permissions(
  operator_email text, p_can_matches boolean, p_can_players boolean, p_can_news boolean,
  p_can_sponsors boolean, p_can_bacheca boolean, p_can_merch boolean, p_can_members boolean default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare normalized_email text := lower(trim(operator_email));
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  if normalized_email = 'capraiafc@gmail.com' then raise exception 'Il super user ha sempre accesso a tutte le aree.' using errcode = '22023'; end if;
  update public.operator_allowlist set
    can_matches = p_can_matches, can_players = p_can_players, can_news = p_can_news,
    can_sponsors = p_can_sponsors, can_bacheca = p_can_bacheca, can_merch = p_can_merch,
    can_members = coalesce(p_can_members, can_members)
  where email = normalized_email;
  if not found then raise exception 'Operatore non trovato.' using errcode = 'P0002'; end if;
end;
$$;

-- Il rinnovo è una transazione: aggiorna scheda e storico insieme. request_id
-- rende sicuro il doppio click/ritento del browser.
create or replace function public.renew_member(
  p_member_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_request_id uuid
)
returns public.members
language plpgsql security definer set search_path = public
as $$
declare
  v_member public.members%rowtype;
  v_existing_member_id uuid;
  v_season text := public.membership_current_season();
  v_method text := nullif(trim(coalesce(p_payment_method, '')), '');
begin
  if not public.has_admin_area_access('members') then
    raise exception 'Accesso negato: area Tesserati richiesta.' using errcode = '42501';
  end if;
  if p_member_id is null or p_request_id is null then
    raise exception 'Tessera e richiesta sono obbligatorie.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 99999999.99 or v_method is null or char_length(v_method) > 80 then
    raise exception 'Inserisci importo positivo e metodo di pagamento valido.' using errcode = '22023';
  end if;

  select member_id into v_existing_member_id from public.member_renewal_events where request_id = p_request_id;
  if found then
    if v_existing_member_id <> p_member_id then raise exception 'Identificativo richiesta già usato.' using errcode = '23505'; end if;
    select * into v_member from public.members where id = p_member_id;
    return v_member;
  end if;

  select * into v_member from public.members where id = p_member_id for update;
  if not found then raise exception 'Tesserato non trovato.' using errcode = 'P0002'; end if;

  select member_id into v_existing_member_id from public.member_renewal_events where request_id = p_request_id;
  if found then return v_member; end if;
  if v_member.renewed_current_season and v_member.renewal_season = v_season then
    raise exception 'Il tesserato ha già rinnovato per la stagione %.', v_season using errcode = '23514';
  end if;

  update public.members
  set renewed_current_season = true, paid = true, payment_method = v_method,
      renewal_total = round(p_amount, 2), renewal_season = v_season, renewed_at = now()
  where id = p_member_id
  returning * into v_member;

  insert into public.member_renewal_events (member_id, season, amount, payment_method, request_id, renewed_by)
  values (p_member_id, v_season, round(p_amount, 2), v_method, p_request_id, auth.uid());
  return v_member;
end;
$$;

create or replace function public.create_member(p_member jsonb)
returns public.members
language plpgsql security definer set search_path = public
as $$
declare
  v_member public.members%rowtype;
  v_card_number integer;
  v_gender_input text := lower(trim(coalesce(p_member ->> 'gender', '')));
  v_gender text;
  v_first_name text := nullif(trim(coalesce(p_member ->> 'first_name', '')), '');
  v_last_name text := nullif(trim(coalesce(p_member ->> 'last_name', '')), '');
  v_member_since date;
begin
  if not public.has_admin_area_access('members') then
    raise exception 'Accesso negato: area Tesserati richiesta.' using errcode = '42501';
  end if;
  if v_first_name is null or v_last_name is null then
    raise exception 'Nome e cognome sono obbligatori.' using errcode = '22023';
  end if;
  if char_length(v_first_name) > 80 or char_length(v_last_name) > 100 then
    raise exception 'Nome o cognome troppo lungo.' using errcode = '22023';
  end if;
  v_gender := case v_gender_input when '' then null when 'm' then 'M' when 'maschio' then 'M' when 'f' then 'F' when 'femmina' then 'F' when 'altro' then 'Altro' when 'other' then 'Altro' else null end;
  if v_gender_input <> '' and v_gender is null then raise exception 'Valore sesso non valido.' using errcode = '22023'; end if;
  begin v_member_since := nullif(p_member ->> 'member_since', '')::date; exception when invalid_text_representation then raise exception 'Data socio dal non valida.' using errcode = '22023'; end;
  if v_member_since is null then v_member_since := (now() at time zone 'Europe/Rome')::date; end if;

  -- La serratura transazionale garantisce il primo numero libero anche con due operatori contemporanei.
  perform pg_advisory_xact_lock(hashtext('public.members.card_number'));
  select candidate into v_card_number
  from generate_series(1, coalesce((select max(card_number) from public.members), 0) + 1) as candidate
  where not exists (select 1 from public.members where card_number = candidate)
  order by candidate limit 1;

  insert into public.members (
    card_number, first_name, last_name, birth_date, birth_place, nationality, tax_code, gender,
    residence, email, phone, identity_document, identity_document_expiry, experience_feedback,
    member_since, renewal_season
  ) values (
    v_card_number, v_first_name, v_last_name,
    nullif(p_member ->> 'birth_date', '')::date, nullif(trim(p_member ->> 'birth_place'), ''),
    nullif(trim(p_member ->> 'nationality'), ''), upper(nullif(trim(p_member ->> 'tax_code'), '')), v_gender,
    nullif(trim(p_member ->> 'residence'), ''), lower(nullif(trim(p_member ->> 'email'), '')),
    nullif(trim(p_member ->> 'phone'), ''), nullif(trim(p_member ->> 'identity_document'), ''),
    nullif(p_member ->> 'identity_document_expiry', '')::date, nullif(trim(p_member ->> 'experience_feedback'), ''),
    v_member_since, public.membership_current_season()
  ) returning * into v_member;
  return v_member;
exception when invalid_text_representation then
  raise exception 'Una data inserita non è valida.' using errcode = '22023';
end;
$$;

-- Da eseguire il 1 luglio via cron Supabase (o all'apertura dell'area admin).
-- È idempotente: non azzera i rinnovi già registrati per la nuova stagione.
create or replace function public.reset_membership_renewals_for_current_season()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer; v_season text := public.membership_current_season();
begin
  if not public.has_admin_area_access('members') then
    raise exception 'Accesso negato: area Tesserati richiesta.' using errcode = '42501';
  end if;
  update public.members
  set renewed_current_season = false, paid = false, payment_method = null, renewal_total = 0, renewal_season = v_season, renewed_at = null
  where renewal_season is distinct from v_season;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table public.members enable row level security;
alter table public.member_renewal_events enable row level security;

-- Le modifiche ai tesserati entrano nello stesso storico amministrativo
-- delle altre aree; il trigger ignora gli import tecnici senza operatore.
drop trigger if exists audit_members_changes on public.members;
create trigger audit_members_changes
after insert or update or delete on public.members
for each row execute function public.audit_admin_change('members');

drop policy if exists "members operators can read members" on public.members;
create policy "members operators can read members" on public.members for select to authenticated using ((select public.has_admin_area_access('members')));
-- Nessuna scrittura diretta dal browser: rinnovi e nuovi soci passano dalle RPC.

revoke all on table public.members, public.member_renewal_events from anon, authenticated;
grant select on table public.members to authenticated;
revoke all on function public.membership_current_season(), public.renew_member(uuid, numeric, text, uuid), public.create_member(jsonb), public.reset_membership_renewals_for_current_season() from public;
grant execute on function public.membership_current_season(), public.renew_member(uuid, numeric, text, uuid), public.create_member(jsonb), public.reset_membership_renewals_for_current_season() to authenticated;
revoke all on function public.list_operator_emails(), public.add_operator(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean), public.set_operator_permissions(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.list_operator_emails(), public.add_operator(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean), public.set_operator_permissions(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
