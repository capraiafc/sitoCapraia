-- Il Kit è un'area indipendente: diritto dedicato, dati separati e conteggi
-- completi anche per chi non possiede ancora nessuna assegnazione.

alter table public.operator_allowlist
  add column if not exists can_kit boolean not null default false;

-- Mantiene l'accesso agli attuali responsabili della Rosa; dalla UI il diritto
-- potrà poi essere modificato separatamente. Gli account giocatore restano
-- esclusi dalle funzioni gestionali tramite is_kit_manager().
update public.operator_allowlist
set can_kit = true
where can_players = true and can_kit = false;

create or replace function public.is_kit_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_user() or exists (
    select 1 from public.operator_allowlist as operator
    where operator.email = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and operator.role in ('operator', 'admin')
      and operator.player_id is null
      and operator.can_kit
  );
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
        when 'kit' then o.can_kit and o.player_id is null
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
    'can_kit', public.has_admin_area_access('kit'),
    'can_news', public.has_admin_area_access('news'),
    'can_sponsors', public.has_admin_area_access('sponsors'),
    'can_bacheca', public.has_admin_area_access('bacheca'),
    'can_merch', public.has_admin_area_access('merch'),
    'can_members', public.has_admin_area_access('members'),
    'player_id', public.current_player_id(),
    'is_player_self_service', public.current_player_id() is not null
  );
$$;

drop function if exists public.list_operator_emails();
create function public.list_operator_emails()
returns table (
  email text, role text, created_at timestamptz,
  can_matches boolean, can_players boolean, can_kit boolean, can_news boolean,
  can_sponsors boolean, can_bacheca boolean, can_merch boolean, can_members boolean,
  player_id uuid, player_name text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  return query
    select o.email, o.role, o.created_at, o.can_matches, o.can_players, o.can_kit, o.can_news,
      o.can_sponsors, o.can_bacheca, o.can_merch, o.can_members, o.player_id, p.display_name
    from public.operator_allowlist o
    left join public.players p on p.id = o.player_id
    order by o.email;
end;
$$;

drop function if exists public.add_operator(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
drop function if exists public.add_operator(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
create function public.add_operator(
  operator_email text, p_can_matches boolean default false, p_can_players boolean default false,
  p_can_news boolean default false, p_can_sponsors boolean default false, p_can_bacheca boolean default false,
  p_can_merch boolean default false, p_can_members boolean default false, p_can_kit boolean default false
)
returns table (
  email text, role text, created_at timestamptz,
  can_matches boolean, can_players boolean, can_kit boolean, can_news boolean,
  can_sponsors boolean, can_bacheca boolean, can_merch boolean, can_members boolean,
  player_id uuid, player_name text
)
language plpgsql security definer set search_path = public as $$
declare normalized_email text := lower(trim(operator_email));
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Inserisci un indirizzo email valido.' using errcode = '22023'; end if;
  insert into public.operator_allowlist (email, role, created_by, can_matches, can_players, can_news, can_sponsors, can_bacheca, can_merch, can_members, can_kit)
  values (normalized_email, 'operator', auth.uid(), p_can_matches, p_can_players, p_can_news, p_can_sponsors, p_can_bacheca, p_can_merch, p_can_members, p_can_kit)
  on conflict (email) do update set
    can_matches = excluded.can_matches, can_players = excluded.can_players, can_news = excluded.can_news,
    can_sponsors = excluded.can_sponsors, can_bacheca = excluded.can_bacheca, can_merch = excluded.can_merch,
    can_members = excluded.can_members, can_kit = excluded.can_kit;
  return query
    select o.email, o.role, o.created_at, o.can_matches, o.can_players, o.can_kit, o.can_news,
      o.can_sponsors, o.can_bacheca, o.can_merch, o.can_members, o.player_id, p.display_name
    from public.operator_allowlist o left join public.players p on p.id = o.player_id where o.email = normalized_email;
end;
$$;

drop function if exists public.set_operator_permissions(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
drop function if exists public.set_operator_permissions(text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean);
create function public.set_operator_permissions(
  operator_email text, p_can_matches boolean, p_can_players boolean, p_can_news boolean,
  p_can_sponsors boolean, p_can_bacheca boolean, p_can_merch boolean, p_can_members boolean default null,
  p_can_kit boolean default null
)
returns void language plpgsql security definer set search_path = public as $$
declare normalized_email text := lower(trim(operator_email));
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  if normalized_email = 'capraiafc@gmail.com' then raise exception 'Il super user ha sempre accesso a tutte le aree.' using errcode = '22023'; end if;
  update public.operator_allowlist set
    can_matches = p_can_matches, can_players = p_can_players, can_news = p_can_news,
    can_sponsors = p_can_sponsors, can_bacheca = p_can_bacheca, can_merch = p_can_merch,
    can_members = coalesce(p_can_members, can_members), can_kit = coalesce(p_can_kit, can_kit)
  where email = normalized_email;
  if not found then raise exception 'Operatore non trovato.' using errcode = 'P0002'; end if;
end;
$$;

-- Politiche: un responsabile Kit non deve possedere automaticamente i diritti
-- completi della Rosa; il giocatore vede invece solo il proprio materiale.
drop policy if exists "kit managers read catalog" on public.kit_items;
create policy "kit managers read catalog" on public.kit_items for select to authenticated
using ((select public.is_kit_manager()) or (select public.current_player_id()) is not null);
drop policy if exists "kit managers read sizes" on public.kit_item_sizes;
create policy "kit managers read sizes" on public.kit_item_sizes for select to authenticated
using ((select public.is_kit_manager()) or (select public.current_player_id()) is not null);
drop policy if exists "kit managers read stock" on public.kit_stock;
create policy "kit managers read stock" on public.kit_stock for select to authenticated using ((select public.is_kit_manager()));
drop policy if exists "kit managers and players read assignments" on public.kit_assignments;
create policy "kit managers and players read assignments" on public.kit_assignments for select to authenticated
using ((select public.is_kit_manager()) or player_id = (select public.current_player_id()));
drop policy if exists "kit managers read stock movements" on public.kit_stock_movements;
create policy "kit managers read stock movements" on public.kit_stock_movements for select to authenticated using ((select public.is_kit_manager()));
drop policy if exists "kit managers and players read requests" on public.kit_requests;
create policy "kit managers and players read requests" on public.kit_requests for select to authenticated
using ((select public.is_kit_manager()) or player_id = (select public.current_player_id()));

create or replace function public.list_kit_inventory()
returns table (item_id uuid, item_name text, category text, item_size_id uuid, size text, quantity integer, assigned_count bigint, missing_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_kit_manager() then raise exception 'Accesso negato: permesso Kit giocatori richiesto.' using errcode = '42501'; end if;
  return query
  select item.id, item.name, item.category, size.id, size.size, stock.quantity,
    count(assignment.id) filter (where assignment.status = 'assigned'),
    count(assignment.id) filter (where assignment.status = 'missing')
  from public.kit_items item
  join public.kit_item_sizes size on size.kit_item_id = item.id
  join public.kit_stock stock on stock.kit_item_size_id = size.id
  left join public.kit_assignments assignment on assignment.kit_item_size_id = size.id
  where item.active
  group by item.id, item.name, item.category, size.id, size.size, stock.quantity
  order by item.category, item.name, case size.size when 'UNICA' then 0 when 'M' then 1 when 'L' then 2 else 3 end;
end;
$$;

create or replace function public.list_kit_eligible_players()
returns table (id uuid, display_name text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_kit_manager() then raise exception 'Accesso negato: permesso Kit giocatori richiesto.' using errcode = '42501'; end if;
  return query select p.id, p.display_name from public.players p
    where p.status in ('active', 'injured', 'unavailable') and p.position <> 'staff' and p.out_of_squad = false
    order by p.display_name;
end;
$$;

create or replace function public.list_kit_missing_players()
returns table (player_id uuid, display_name text, missing_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_kit_manager() then raise exception 'Accesso negato: permesso Kit giocatori richiesto.' using errcode = '42501'; end if;
  return query
  select player.id, player.display_name,
    count(item.id) filter (where coalesce(assignment.status, 'missing') <> 'assigned')
  from public.players player
  cross join public.kit_items item
  left join public.kit_assignments assignment on assignment.player_id = player.id and assignment.kit_item_id = item.id
  where player.status in ('active', 'injured', 'unavailable') and player.position <> 'staff'
    and player.out_of_squad = false and item.active
  group by player.id, player.display_name
  having count(item.id) filter (where coalesce(assignment.status, 'missing') <> 'assigned') > 0
  order by count(item.id) filter (where coalesce(assignment.status, 'missing') <> 'assigned') desc, player.display_name;
end;
$$;

create or replace function public.list_player_kit_overview()
returns table (player_id uuid, missing_count bigint, pending_request_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione Rosa richiesta.' using errcode = '42501'; end if;
  return query
  select player.id,
    (select count(*) from public.kit_items item
      left join public.kit_assignments assignment on assignment.kit_item_id = item.id and assignment.player_id = player.id
      where item.active and coalesce(assignment.status, 'missing') <> 'assigned'),
    (select count(*) from public.kit_requests request where request.player_id = player.id and request.status = 'pending')
  from public.players player
  where player.status in ('active', 'injured', 'unavailable') and player.position <> 'staff' and player.out_of_squad = false;
end;
$$;

create or replace function public.list_kit_player_assignments(p_player_id uuid)
returns table (item_id uuid, item_name text, category text, item_size_id uuid, size text, status text)
language plpgsql security definer set search_path = public as $$
begin
  if p_player_id is null or (not public.is_kit_manager() and p_player_id <> public.current_player_id()) then raise exception 'Accesso negato alla scheda materiale.' using errcode = '42501'; end if;
  return query
  select item.id, item.name, item.category, size.id, size.size, coalesce(assignment.status, 'missing')
  from public.kit_items item
  left join public.kit_assignments assignment on assignment.kit_item_id = item.id and assignment.player_id = p_player_id
  left join public.kit_item_sizes size on size.id = assignment.kit_item_size_id
  where item.active order by item.category, item.name;
end;
$$;

create or replace function public.set_kit_stock(p_item_size_id uuid, p_quantity integer)
returns public.kit_stock language plpgsql security definer set search_path = public as $$
declare v_stock public.kit_stock%rowtype; v_delta integer;
begin
  if not public.is_kit_manager() then raise exception 'Accesso negato: permesso Kit giocatori richiesto.' using errcode = '42501'; end if;
  if p_item_size_id is null or p_quantity is null or p_quantity < 0 or p_quantity > 10000 then raise exception 'Quantità non valida.' using errcode = '22023'; end if;
  select * into v_stock from public.kit_stock where kit_item_size_id = p_item_size_id for update;
  if not found then raise exception 'Taglia kit non trovata.' using errcode = 'P0002'; end if;
  v_delta := p_quantity - v_stock.quantity;
  update public.kit_stock set quantity = p_quantity, updated_by = auth.uid() where kit_item_size_id = p_item_size_id returning * into v_stock;
  if v_delta <> 0 then insert into public.kit_stock_movements (kit_item_size_id, quantity_delta, reason, created_by) values (p_item_size_id, v_delta, 'manual_adjustment', auth.uid()); end if;
  return v_stock;
end;
$$;

create or replace function public.assign_kit_item(p_player_id uuid, p_item_size_id uuid)
returns public.kit_assignments language plpgsql security definer set search_path = public as $$
declare v_stock public.kit_stock%rowtype; v_size public.kit_item_sizes%rowtype; v_assignment public.kit_assignments%rowtype;
begin
  if not public.is_kit_manager() then raise exception 'Accesso negato: permesso Kit giocatori richiesto.' using errcode = '42501'; end if;
  if not exists (select 1 from public.players where id = p_player_id and status in ('active', 'injured', 'unavailable') and position <> 'staff' and out_of_squad = false) then raise exception 'Giocatore non disponibile per il kit.' using errcode = '22023'; end if;
  select * into v_size from public.kit_item_sizes where id = p_item_size_id;
  if not found then raise exception 'Taglia kit non trovata.' using errcode = 'P0002'; end if;
  select * into v_stock from public.kit_stock where kit_item_size_id = p_item_size_id for update;
  if v_stock.quantity <= 0 then raise exception 'Nessun pezzo disponibile per questa taglia.' using errcode = '23514'; end if;
  insert into public.kit_assignments (player_id, kit_item_id, kit_item_size_id, status, assigned_at, marked_missing_at, updated_by)
  values (p_player_id, v_size.kit_item_id, p_item_size_id, 'assigned', now(), null, auth.uid())
  on conflict (player_id, kit_item_id) do update set kit_item_size_id = excluded.kit_item_size_id, status = 'assigned', assigned_at = now(), marked_missing_at = null, updated_by = auth.uid()
  returning * into v_assignment;
  update public.kit_stock set quantity = quantity - 1, updated_by = auth.uid() where kit_item_size_id = p_item_size_id;
  insert into public.kit_stock_movements (kit_item_size_id, quantity_delta, reason, player_id, created_by) values (p_item_size_id, -1, 'assignment', p_player_id, auth.uid());
  return v_assignment;
end;
$$;

create or replace function public.mark_kit_item_missing(p_player_id uuid, p_item_id uuid)
returns public.kit_assignments language plpgsql security definer set search_path = public as $$
declare v_assignment public.kit_assignments%rowtype;
begin
  if not public.is_kit_manager() then raise exception 'Accesso negato: permesso Kit giocatori richiesto.' using errcode = '42501'; end if;
  update public.kit_assignments set status = 'missing', marked_missing_at = now(), updated_by = auth.uid()
  where player_id = p_player_id and kit_item_id = p_item_id returning * into v_assignment;
  if not found then raise exception 'Assegnazione kit non trovata.' using errcode = 'P0002'; end if;
  return v_assignment;
end;
$$;

create or replace function public.list_kit_requests(p_status text default 'pending')
returns table (id uuid, player_id uuid, player_name text, player_email text, item_id uuid, item_name text, category text, item_size_id uuid, size text, reason text, status text, rejection_reason text, created_at timestamptz, resolved_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_kit_manager() then raise exception 'Accesso negato: permesso Kit giocatori richiesto.' using errcode = '42501'; end if;
  return query select request.id, player.id, player.display_name, details.email, item.id, item.name, item.category, size.id, size.size, request.reason, request.status, request.rejection_reason, request.created_at, request.resolved_at
  from public.kit_requests request join public.players player on player.id = request.player_id
  left join public.player_private_details details on details.player_id = player.id
  join public.kit_items item on item.id = request.kit_item_id join public.kit_item_sizes size on size.id = request.kit_item_size_id
  where p_status is null or request.status = p_status order by request.created_at desc;
end;
$$;

create or replace function public.resolve_kit_request(p_request_id uuid, p_outcome text, p_rejection_reason text default null)
returns public.kit_requests language plpgsql security definer set search_path = public as $$
declare v_request public.kit_requests%rowtype; v_stock public.kit_stock%rowtype; v_reason text := trim(coalesce(p_rejection_reason, ''));
begin
  if not public.is_kit_manager() then raise exception 'Accesso negato: permesso Kit giocatori richiesto.' using errcode = '42501'; end if;
  if p_outcome not in ('approved', 'rejected') then raise exception 'Esito richiesta non valido.' using errcode = '22023'; end if;
  select * into v_request from public.kit_requests where id = p_request_id for update;
  if not found then raise exception 'Richiesta non trovata.' using errcode = 'P0002'; end if;
  if v_request.status <> 'pending' then return v_request; end if;
  if p_outcome = 'rejected' then
    if char_length(v_reason) < 5 or char_length(v_reason) > 1500 then raise exception 'Inserisci una motivazione di almeno 5 caratteri.' using errcode = '22023'; end if;
    update public.kit_requests set status = 'rejected', rejection_reason = v_reason, resolved_at = now(), resolved_by = auth.uid() where id = v_request.id returning * into v_request;
    return v_request;
  end if;
  if not exists (select 1 from public.players where id = v_request.player_id and status in ('active', 'injured', 'unavailable') and position <> 'staff' and out_of_squad = false) then raise exception 'Il giocatore non è disponibile per il kit.' using errcode = '22023'; end if;
  select * into v_stock from public.kit_stock where kit_item_size_id = v_request.kit_item_size_id for update;
  if not found or v_stock.quantity <= 0 then raise exception 'Nessun pezzo disponibile per la taglia richiesta.' using errcode = '23514'; end if;
  insert into public.kit_assignments (player_id, kit_item_id, kit_item_size_id, status, assigned_at, marked_missing_at, updated_by)
  values (v_request.player_id, v_request.kit_item_id, v_request.kit_item_size_id, 'assigned', now(), null, auth.uid())
  on conflict (player_id, kit_item_id) do update set kit_item_size_id = excluded.kit_item_size_id, status = 'assigned', assigned_at = now(), marked_missing_at = null, updated_by = auth.uid();
  update public.kit_stock set quantity = quantity - 1, updated_by = auth.uid() where kit_item_size_id = v_request.kit_item_size_id;
  insert into public.kit_stock_movements (kit_item_size_id, quantity_delta, reason, player_id, created_by) values (v_request.kit_item_size_id, -1, 'assignment', v_request.player_id, auth.uid());
  update public.kit_requests set status = 'approved', rejection_reason = null, resolved_at = now(), resolved_by = auth.uid() where id = v_request.id returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.is_kit_manager() from public;
revoke all on function public.list_kit_eligible_players() from public;
revoke all on function public.list_player_kit_overview() from public;
grant execute on function public.is_kit_manager(), public.list_kit_inventory(), public.list_kit_eligible_players(), public.list_kit_missing_players(), public.list_player_kit_overview(), public.list_kit_player_assignments(uuid), public.set_kit_stock(uuid, integer), public.assign_kit_item(uuid, uuid), public.mark_kit_item_missing(uuid, uuid), public.list_kit_requests(text), public.resolve_kit_request(uuid, text, text) to authenticated;
