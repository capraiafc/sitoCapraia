-- Disponibilità del merchandising, per taglia o a taglia unica, e richieste dal sito.

alter table public.merch_products
  add column if not exists size_mode text not null default 'sized',
  add column if not exists stock_s integer not null default 0,
  add column if not exists stock_m integer not null default 0,
  add column if not exists stock_l integer not null default 0,
  add column if not exists stock_xl integer not null default 0,
  add column if not exists stock_xxl integer not null default 0,
  add column if not exists one_size_stock integer not null default 0;

alter table public.merch_products
  drop constraint if exists merch_products_size_mode_check,
  add constraint merch_products_size_mode_check check (size_mode in ('sized', 'one_size')),
  drop constraint if exists merch_products_stock_s_check,
  add constraint merch_products_stock_s_check check (stock_s >= 0),
  drop constraint if exists merch_products_stock_m_check,
  add constraint merch_products_stock_m_check check (stock_m >= 0),
  drop constraint if exists merch_products_stock_l_check,
  add constraint merch_products_stock_l_check check (stock_l >= 0),
  drop constraint if exists merch_products_stock_xl_check,
  add constraint merch_products_stock_xl_check check (stock_xl >= 0),
  drop constraint if exists merch_products_stock_xxl_check,
  add constraint merch_products_stock_xxl_check check (stock_xxl >= 0),
  drop constraint if exists merch_products_one_size_stock_check,
  add constraint merch_products_one_size_stock_check check (one_size_stock >= 0);

create table if not exists public.merch_order_requests (
  request_id uuid primary key,
  product_id uuid not null references public.merch_products(id) on delete restrict,
  product_name text not null,
  unit_price numeric(10, 2) not null,
  size_label text not null,
  quantity integer not null check (quantity > 0),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  privacy_accepted boolean not null default false,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists merch_order_requests_product_idx on public.merch_order_requests (product_id, created_at desc);

alter table public.merch_order_requests enable row level security;

drop policy if exists "operators can read merch order requests" on public.merch_order_requests;
create policy "operators can read merch order requests"
on public.merch_order_requests for select to authenticated
using ((select public.is_current_operator()));

create or replace function public.reserve_merch_stock(
  p_request_id uuid,
  p_product_id uuid,
  p_size text,
  p_quantity integer,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  product public.merch_products%rowtype;
  previous public.merch_order_requests%rowtype;
  size_label text;
  remaining integer;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Quantità non valida.' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_customer_name)), 0) < 2 or coalesce(length(btrim(p_customer_name)), 0) > 160
    or coalesce(length(btrim(p_customer_email)), 0) > 254 or p_customer_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or coalesce(length(btrim(p_customer_phone)), 0) < 5 or coalesce(length(btrim(p_customer_phone)), 0) > 60 then
    raise exception 'Dati di contatto non validi.' using errcode = '22023';
  end if;

  select * into previous from public.merch_order_requests where request_id = p_request_id;
  if found then
    return jsonb_build_object('request_id', previous.request_id, 'product_name', previous.product_name, 'unit_price', previous.unit_price, 'size_label', previous.size_label, 'quantity', previous.quantity, 'already_reserved', true);
  end if;

  select * into product from public.merch_products where id = p_product_id for update;
  if not found or not product.published or not product.available then
    raise exception 'Questo prodotto non è al momento disponibile.' using errcode = 'P0001';
  end if;

  if product.size_mode = 'one_size' then
    if p_size <> 'ONE_SIZE' then raise exception 'Taglia non valida.' using errcode = '22023'; end if;
    update public.merch_products set one_size_stock = one_size_stock - p_quantity where id = p_product_id and one_size_stock >= p_quantity returning * into product;
    if not found then raise exception 'Pezzi esauriti: seleziona una quantità inferiore.' using errcode = 'P0001'; end if;
    size_label := 'Taglia unica';
    remaining := product.one_size_stock;
  else
    if p_size not in ('S', 'M', 'L', 'XL', 'XXL') then raise exception 'Taglia non valida.' using errcode = '22023'; end if;
    if p_size = 'S' then update public.merch_products set stock_s = stock_s - p_quantity where id = p_product_id and stock_s >= p_quantity returning * into product;
    elsif p_size = 'M' then update public.merch_products set stock_m = stock_m - p_quantity where id = p_product_id and stock_m >= p_quantity returning * into product;
    elsif p_size = 'L' then update public.merch_products set stock_l = stock_l - p_quantity where id = p_product_id and stock_l >= p_quantity returning * into product;
    elsif p_size = 'XL' then update public.merch_products set stock_xl = stock_xl - p_quantity where id = p_product_id and stock_xl >= p_quantity returning * into product;
    else update public.merch_products set stock_xxl = stock_xxl - p_quantity where id = p_product_id and stock_xxl >= p_quantity returning * into product;
    end if;
    if not found then raise exception 'Questa taglia non è più disponibile nella quantità richiesta.' using errcode = 'P0001'; end if;
    size_label := p_size;
    remaining := case p_size when 'S' then product.stock_s when 'M' then product.stock_m when 'L' then product.stock_l when 'XL' then product.stock_xl else product.stock_xxl end;
  end if;

  insert into public.merch_order_requests (request_id, product_id, product_name, unit_price, size_label, quantity, customer_name, customer_email, customer_phone, privacy_accepted)
  values (p_request_id, product.id, product.name, product.price, size_label, p_quantity, btrim(p_customer_name), lower(btrim(p_customer_email)), btrim(p_customer_phone), true);

  return jsonb_build_object('request_id', p_request_id, 'product_name', product.name, 'unit_price', product.price, 'size_label', size_label, 'quantity', p_quantity, 'remaining_stock', remaining, 'already_reserved', false);
end;
$$;

create or replace function public.mark_merch_request_emailed(p_request_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.merch_order_requests set emailed_at = coalesce(emailed_at, now()) where request_id = p_request_id;
$$;

create or replace function public.cancel_merch_reservation(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare order_row public.merch_order_requests%rowtype;
begin
  select * into order_row from public.merch_order_requests where request_id = p_request_id and emailed_at is null for update;
  if not found then return; end if;
  if order_row.size_label = 'Taglia unica' then
    update public.merch_products set one_size_stock = one_size_stock + order_row.quantity where id = order_row.product_id;
  elsif order_row.size_label = 'S' then update public.merch_products set stock_s = stock_s + order_row.quantity where id = order_row.product_id;
  elsif order_row.size_label = 'M' then update public.merch_products set stock_m = stock_m + order_row.quantity where id = order_row.product_id;
  elsif order_row.size_label = 'L' then update public.merch_products set stock_l = stock_l + order_row.quantity where id = order_row.product_id;
  elsif order_row.size_label = 'XL' then update public.merch_products set stock_xl = stock_xl + order_row.quantity where id = order_row.product_id;
  else update public.merch_products set stock_xxl = stock_xxl + order_row.quantity where id = order_row.product_id;
  end if;
  delete from public.merch_order_requests where request_id = p_request_id;
end;
$$;

revoke all on function public.reserve_merch_stock(uuid, uuid, text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_merch_request_emailed(uuid) from public, anon, authenticated;
revoke all on function public.cancel_merch_reservation(uuid) from public, anon, authenticated;
grant execute on function public.reserve_merch_stock(uuid, uuid, text, integer, text, text, text) to service_role;
grant execute on function public.mark_merch_request_emailed(uuid) to service_role;
grant execute on function public.cancel_merch_reservation(uuid) to service_role;
grant select on public.merch_order_requests to authenticated;
