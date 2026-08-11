-- Richieste di nuovo materiale inviate dal giocatore e gestite dalla società.

create table if not exists public.kit_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  player_id uuid not null references public.players(id) on delete cascade,
  kit_item_id uuid not null references public.kit_items(id) on delete restrict,
  kit_item_size_id uuid not null references public.kit_item_sizes(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 5 and 1500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text check (rejection_reason is null or char_length(trim(rejection_reason)) between 5 and 1500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create unique index if not exists kit_requests_one_pending_per_item
  on public.kit_requests (player_id, kit_item_id) where status = 'pending';
create index if not exists kit_requests_status_created_idx on public.kit_requests (status, created_at desc);

alter table public.kit_requests enable row level security;
revoke all on public.kit_requests from anon;
grant select on public.kit_requests to authenticated;

drop policy if exists "kit managers and players read requests" on public.kit_requests;
create policy "kit managers and players read requests" on public.kit_requests for select to authenticated
using ((select public.can_manage_all_players()) or player_id = (select public.current_player_id()));

create or replace function public.create_my_kit_request(
  p_kit_item_id uuid,
  p_kit_item_size_id uuid,
  p_reason text,
  p_request_key uuid
)
returns public.kit_requests
language plpgsql security definer set search_path = public as $$
declare
  v_player_id uuid := public.current_player_id();
  v_request public.kit_requests%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_player_id is null then raise exception 'Accesso negato: scheda giocatore non collegata.' using errcode = '42501'; end if;
  if p_request_key is null or p_kit_item_id is null or p_kit_item_size_id is null or char_length(v_reason) < 5 or char_length(v_reason) > 1500 then
    raise exception 'Inserisci articolo, taglia e una motivazione di almeno 5 caratteri.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.players where id = v_player_id and status in ('active', 'injured', 'unavailable') and out_of_squad = false) then
    raise exception 'La richiesta materiale non è disponibile per questa scheda.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.kit_item_sizes as size
    join public.kit_items as item on item.id = size.kit_item_id and item.active
    where size.id = p_kit_item_size_id and size.kit_item_id = p_kit_item_id
  ) then raise exception 'Articolo o taglia non validi.' using errcode = '22023'; end if;

  select * into v_request from public.kit_requests where request_key = p_request_key;
  if found then
    if v_request.player_id <> v_player_id then raise exception 'Identificativo richiesta già utilizzato.' using errcode = '23505'; end if;
    return v_request;
  end if;

  insert into public.kit_requests (request_key, player_id, kit_item_id, kit_item_size_id, reason)
  values (p_request_key, v_player_id, p_kit_item_id, p_kit_item_size_id, v_reason)
  returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.list_kit_requests(p_status text default 'pending')
returns table (
  id uuid, player_id uuid, player_name text, player_email text, item_id uuid,
  item_name text, category text, item_size_id uuid, size text, reason text,
  status text, rejection_reason text, created_at timestamptz, resolved_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione rosa richiesta.' using errcode = '42501'; end if;
  return query
  select request.id, player.id, player.display_name, details.email, item.id, item.name, item.category,
    size.id, size.size, request.reason, request.status, request.rejection_reason, request.created_at, request.resolved_at
  from public.kit_requests as request
  join public.players as player on player.id = request.player_id
  left join public.player_private_details as details on details.player_id = player.id
  join public.kit_items as item on item.id = request.kit_item_id
  join public.kit_item_sizes as size on size.id = request.kit_item_size_id
  where p_status is null or request.status = p_status
  order by request.created_at desc;
end;
$$;

create or replace function public.resolve_kit_request(
  p_request_id uuid,
  p_outcome text,
  p_rejection_reason text default null
)
returns public.kit_requests
language plpgsql security definer set search_path = public as $$
declare
  v_request public.kit_requests%rowtype;
  v_stock public.kit_stock%rowtype;
  v_reason text := trim(coalesce(p_rejection_reason, ''));
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione rosa richiesta.' using errcode = '42501'; end if;
  if p_outcome not in ('approved', 'rejected') then raise exception 'Esito richiesta non valido.' using errcode = '22023'; end if;
  select * into v_request from public.kit_requests where id = p_request_id for update;
  if not found then raise exception 'Richiesta non trovata.' using errcode = 'P0002'; end if;
  if v_request.status <> 'pending' then return v_request; end if;

  if p_outcome = 'rejected' then
    if char_length(v_reason) < 5 or char_length(v_reason) > 1500 then raise exception 'Inserisci una motivazione di almeno 5 caratteri.' using errcode = '22023'; end if;
    update public.kit_requests set status = 'rejected', rejection_reason = v_reason, resolved_at = now(), resolved_by = auth.uid() where id = v_request.id returning * into v_request;
    return v_request;
  end if;

  if not exists (select 1 from public.players where id = v_request.player_id and status in ('active', 'injured', 'unavailable') and out_of_squad = false) then
    raise exception 'Il giocatore non è disponibile per il kit.' using errcode = '22023';
  end if;
  select * into v_stock from public.kit_stock where kit_item_size_id = v_request.kit_item_size_id for update;
  if not found or v_stock.quantity <= 0 then raise exception 'Nessun pezzo disponibile per la taglia richiesta.' using errcode = '23514'; end if;

  insert into public.kit_assignments (player_id, kit_item_id, kit_item_size_id, status, assigned_at, marked_missing_at, updated_by)
  values (v_request.player_id, v_request.kit_item_id, v_request.kit_item_size_id, 'assigned', now(), null, auth.uid())
  on conflict (player_id, kit_item_id) do update set kit_item_size_id = excluded.kit_item_size_id, status = 'assigned', assigned_at = now(), marked_missing_at = null, updated_by = auth.uid();
  update public.kit_stock set quantity = quantity - 1, updated_by = auth.uid() where kit_item_size_id = v_request.kit_item_size_id;
  insert into public.kit_stock_movements (kit_item_size_id, quantity_delta, reason, player_id, created_by)
  values (v_request.kit_item_size_id, -1, 'assignment', v_request.player_id, auth.uid());
  update public.kit_requests set status = 'approved', rejection_reason = null, resolved_at = now(), resolved_by = auth.uid() where id = v_request.id returning * into v_request;
  return v_request;
end;
$$;

revoke all on function public.create_my_kit_request(uuid, uuid, text, uuid) from public;
revoke all on function public.list_kit_requests(text) from public;
revoke all on function public.resolve_kit_request(uuid, text, text) from public;
grant execute on function public.create_my_kit_request(uuid, uuid, text, uuid), public.list_kit_requests(text), public.resolve_kit_request(uuid, text, text) to authenticated;
