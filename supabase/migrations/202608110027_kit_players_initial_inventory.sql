-- Catalogo e gestione iniziale del kit giocatori.
-- Le quantità rappresentano la disponibilità attuale di magazzino: il kit
-- storico già consegnato viene registrato separatamente nelle assegnazioni.

alter table public.players
  add column if not exists out_of_squad boolean not null default false;

create table if not exists public.kit_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  category text not null check (category in ('training', 'leisure')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kit_item_sizes (
  id uuid primary key default gen_random_uuid(),
  kit_item_id uuid not null references public.kit_items(id) on delete cascade,
  size text not null check (char_length(trim(size)) between 1 and 20),
  unique (kit_item_id, size)
);

create table if not exists public.kit_stock (
  kit_item_size_id uuid primary key references public.kit_item_sizes(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.kit_assignments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  kit_item_id uuid not null references public.kit_items(id) on delete restrict,
  kit_item_size_id uuid references public.kit_item_sizes(id) on delete restrict,
  status text not null default 'assigned' check (status in ('assigned', 'missing')),
  assigned_at timestamptz,
  marked_missing_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (player_id, kit_item_id)
);

create index if not exists kit_assignments_player_status_idx on public.kit_assignments (player_id, status);
create index if not exists kit_assignments_missing_idx on public.kit_assignments (kit_item_id, player_id) where status = 'missing';

create table if not exists public.kit_stock_movements (
  id bigint generated always as identity primary key,
  kit_item_size_id uuid not null references public.kit_item_sizes(id) on delete restrict,
  quantity_delta integer not null,
  reason text not null check (reason in ('manual_adjustment', 'assignment')),
  player_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create or replace function public.set_kit_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_kit_items_updated_at on public.kit_items;
create trigger set_kit_items_updated_at before update on public.kit_items
for each row execute function public.set_kit_updated_at();

drop trigger if exists set_kit_stock_updated_at on public.kit_stock;
create trigger set_kit_stock_updated_at before update on public.kit_stock
for each row execute function public.set_kit_updated_at();

drop trigger if exists set_kit_assignments_updated_at on public.kit_assignments;
create trigger set_kit_assignments_updated_at before update on public.kit_assignments
for each row execute function public.set_kit_updated_at();

-- Catalogo concordato con la società.
insert into public.kit_items (code, name, category)
values
  ('training_bag', 'Borsa', 'training'),
  ('training_blue_sweatshirt', 'Felpa allenamento blu', 'training'),
  ('training_blue_shirt', 'Maglia allenamento blu', 'training'),
  ('training_yellow_shorts', 'Pantaloncini gialli', 'training'),
  ('training_yellow_socks', 'Calzettoni gialli', 'training'),
  ('training_blue_socks', 'Calzettoni blu', 'training'),
  ('training_kway', 'Kway', 'training'),
  ('leisure_sweatshirt', 'Felpa', 'leisure'),
  ('leisure_long_trousers', 'Pantalone lungo', 'leisure'),
  ('leisure_gilet', 'Smanicato', 'leisure'),
  ('leisure_jacket', 'Giaccone', 'leisure'),
  ('leisure_polo', 'Polo', 'leisure'),
  ('leisure_bermuda', 'Bermuda', 'leisure')
on conflict (code) do update set name = excluded.name, category = excluded.category, active = true;

-- Borsa: taglia unica. Tutto l'abbigliamento: M 15, L 10, XL 5.
insert into public.kit_item_sizes (kit_item_id, size)
select item.id, size.value
from public.kit_items as item
cross join lateral (
  select 'UNICA'::text as value where item.code = 'training_bag'
  union all select 'M' where item.code <> 'training_bag'
  union all select 'L' where item.code <> 'training_bag'
  union all select 'XL' where item.code <> 'training_bag'
) as size
on conflict (kit_item_id, size) do nothing;

insert into public.kit_stock (kit_item_size_id, quantity)
select size.id,
  case size.size when 'M' then 15 when 'L' then 10 when 'XL' then 5 else 30 end
from public.kit_item_sizes as size
on conflict (kit_item_size_id) do nothing;

-- Tutti i giocatori attivi ricevono il kit completo al bootstrap. La taglia
-- viene letta dalla scheda privata; quando non è M/L/XL la scelta prudente è L.
with eligible_players as (
  select p.id,
    case upper(trim(coalesce(details.kit_size, '')))
      when 'M' then 'M' when 'L' then 'L' when 'XL' then 'XL' else 'L'
    end as kit_size
  from public.players as p
  left join public.player_private_details as details on details.player_id = p.id
  where p.status in ('active', 'injured', 'unavailable')
    and p.position <> 'staff'
    and p.out_of_squad = false
    and lower(trim(p.last_name)) not in ('marchiani', 'mannini', 'marrazzo', 'bellucci')
), assignment_seed as (
  select player.id as player_id, item.id as kit_item_id, size.id as kit_item_size_id
  from eligible_players as player
  cross join public.kit_items as item
  join public.kit_item_sizes as size on size.kit_item_id = item.id
    and size.size = case when item.code = 'training_bag' then 'UNICA' else player.kit_size end
  where item.active = true
)
insert into public.kit_assignments (player_id, kit_item_id, kit_item_size_id, status, assigned_at)
select player_id, kit_item_id, kit_item_size_id, 'assigned', now()
from assignment_seed
on conflict (player_id, kit_item_id) do nothing;

-- Il conteggio iniziale è fisico: dopo avere registrato il materiale già
-- consegnato, dal magazzino resta soltanto ciò che non è stato assegnato.
update public.kit_stock as stock
set quantity = greatest(0,
  case size.size when 'M' then 15 when 'L' then 10 when 'XL' then 5 else 30 end
  - coalesce(assigned.total, 0)
)
from public.kit_item_sizes as size
left join lateral (
  select count(*)::integer as total
  from public.kit_assignments as assignment
  where assignment.kit_item_size_id = size.id and assignment.status = 'assigned'
) as assigned on true
where stock.kit_item_size_id = size.id;

alter table public.kit_items enable row level security;
alter table public.kit_item_sizes enable row level security;
alter table public.kit_stock enable row level security;
alter table public.kit_assignments enable row level security;
alter table public.kit_stock_movements enable row level security;

revoke all on public.kit_items, public.kit_item_sizes, public.kit_stock, public.kit_assignments, public.kit_stock_movements from anon;
grant select on public.kit_items, public.kit_item_sizes, public.kit_stock, public.kit_assignments, public.kit_stock_movements to authenticated;

drop policy if exists "kit managers read catalog" on public.kit_items;
create policy "kit managers read catalog" on public.kit_items for select to authenticated
using ((select public.can_manage_all_players()) or (select public.current_player_id()) is not null);
drop policy if exists "kit managers read sizes" on public.kit_item_sizes;
create policy "kit managers read sizes" on public.kit_item_sizes for select to authenticated
using ((select public.can_manage_all_players()) or (select public.current_player_id()) is not null);
drop policy if exists "kit managers read stock" on public.kit_stock;
create policy "kit managers read stock" on public.kit_stock for select to authenticated
using ((select public.can_manage_all_players()));
drop policy if exists "kit managers and players read assignments" on public.kit_assignments;
create policy "kit managers and players read assignments" on public.kit_assignments for select to authenticated
using ((select public.can_manage_all_players()) or player_id = (select public.current_player_id()));
drop policy if exists "kit managers read stock movements" on public.kit_stock_movements;
create policy "kit managers read stock movements" on public.kit_stock_movements for select to authenticated
using ((select public.can_manage_all_players()));

create or replace function public.list_kit_inventory()
returns table (
  item_id uuid, item_name text, category text, item_size_id uuid, size text,
  quantity integer, assigned_count bigint, missing_count bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione rosa richiesta.' using errcode = '42501'; end if;
  return query
  select item.id, item.name, item.category, size.id, size.size, stock.quantity,
    count(assignment.id) filter (where assignment.status = 'assigned'),
    count(assignment.id) filter (where assignment.status = 'missing')
  from public.kit_items as item
  join public.kit_item_sizes as size on size.kit_item_id = item.id
  join public.kit_stock as stock on stock.kit_item_size_id = size.id
  left join public.kit_assignments as assignment on assignment.kit_item_size_id = size.id
  where item.active
  group by item.id, item.name, item.category, size.id, size.size, stock.quantity
  order by item.category, item.name, case size.size when 'UNICA' then 0 when 'M' then 1 when 'L' then 2 else 3 end;
end;
$$;

create or replace function public.list_kit_missing_players()
returns table (player_id uuid, display_name text, missing_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione rosa richiesta.' using errcode = '42501'; end if;
  return query
  select player.id, player.display_name, count(assignment.id)
  from public.players as player
  join public.kit_assignments as assignment on assignment.player_id = player.id and assignment.status = 'missing'
  where player.status in ('active', 'injured', 'unavailable') and player.out_of_squad = false
  group by player.id, player.display_name
  order by count(assignment.id) desc, player.display_name;
end;
$$;

create or replace function public.list_kit_player_assignments(p_player_id uuid)
returns table (item_id uuid, item_name text, category text, item_size_id uuid, size text, status text)
language plpgsql security definer set search_path = public as $$
begin
  if p_player_id is null or (not public.can_manage_all_players() and p_player_id <> public.current_player_id()) then
    raise exception 'Accesso negato alla scheda materiale.' using errcode = '42501';
  end if;
  return query
  select item.id, item.name, item.category, size.id, size.size,
    coalesce(assignment.status, 'missing')
  from public.kit_items as item
  left join public.kit_assignments as assignment on assignment.kit_item_id = item.id and assignment.player_id = p_player_id
  left join public.kit_item_sizes as size on size.id = assignment.kit_item_size_id
  where item.active
  order by item.category, item.name;
end;
$$;

create or replace function public.set_kit_stock(p_item_size_id uuid, p_quantity integer)
returns public.kit_stock
language plpgsql security definer set search_path = public as $$
declare v_stock public.kit_stock%rowtype; v_delta integer;
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione rosa richiesta.' using errcode = '42501'; end if;
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
returns public.kit_assignments
language plpgsql security definer set search_path = public as $$
declare v_stock public.kit_stock%rowtype; v_size public.kit_item_sizes%rowtype; v_assignment public.kit_assignments%rowtype;
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione rosa richiesta.' using errcode = '42501'; end if;
  if not exists (select 1 from public.players where id = p_player_id and status in ('active', 'injured', 'unavailable') and out_of_squad = false) then raise exception 'Giocatore non disponibile per il kit.' using errcode = '22023'; end if;
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
returns public.kit_assignments
language plpgsql security definer set search_path = public as $$
declare v_assignment public.kit_assignments%rowtype;
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione rosa richiesta.' using errcode = '42501'; end if;
  update public.kit_assignments set status = 'missing', marked_missing_at = now(), updated_by = auth.uid()
  where player_id = p_player_id and kit_item_id = p_item_id
  returning * into v_assignment;
  if not found then raise exception 'Assegnazione kit non trovata.' using errcode = 'P0002'; end if;
  return v_assignment;
end;
$$;

revoke all on function public.list_kit_inventory() from public;
revoke all on function public.list_kit_missing_players() from public;
revoke all on function public.list_kit_player_assignments(uuid) from public;
revoke all on function public.set_kit_stock(uuid, integer) from public;
revoke all on function public.assign_kit_item(uuid, uuid) from public;
revoke all on function public.mark_kit_item_missing(uuid, uuid) from public;
grant execute on function public.list_kit_inventory(), public.list_kit_missing_players(), public.list_kit_player_assignments(uuid), public.set_kit_stock(uuid, integer), public.assign_kit_item(uuid, uuid), public.mark_kit_item_missing(uuid, uuid) to authenticated;
