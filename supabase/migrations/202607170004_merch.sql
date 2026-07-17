-- Capraia FC: catalogo merch per operatori
-- Prerequisito: 20260717_operator_access.sql (public.is_current_operator()).
-- Il browser usa esclusivamente la chiave anon; RLS è il controllo autorevole.

create table if not exists public.merch_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  price numeric(10, 2) not null check (price >= 0),
  description text check (description is null or char_length(btrim(description)) <= 4000),
  image_url text check (
    image_url is null
    or image_url ~* '^https?://[^[:space:]]+$'
  ),
  available boolean not null default true,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.merch_products is
  'Catalogo merchandising. Le modifiche sono per soli operatori tramite RLS.';

create index if not exists merch_products_public_catalog_idx
  on public.merch_products (available, created_at desc)
  where published = true;

create or replace function public.set_merch_product_updated_fields()
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

drop trigger if exists set_merch_product_updated_fields on public.merch_products;
create trigger set_merch_product_updated_fields
before update on public.merch_products
for each row execute function public.set_merch_product_updated_fields();

alter table public.merch_products enable row level security;

-- Il catalogo pubblico espone solo prodotti scelti per la pubblicazione.
drop policy if exists "public can read published merch products" on public.merch_products;
create policy "public can read published merch products"
on public.merch_products for select
using (published = true);

-- Gli operatori possono vedere bozze e gestire l'intero catalogo.
drop policy if exists "operators can read all merch products" on public.merch_products;
create policy "operators can read all merch products"
on public.merch_products for select
to authenticated
using ((select public.is_current_operator()));

drop policy if exists "operators can create merch products" on public.merch_products;
create policy "operators can create merch products"
on public.merch_products for insert
to authenticated
with check ((select public.is_current_operator()));

drop policy if exists "operators can update merch products" on public.merch_products;
create policy "operators can update merch products"
on public.merch_products for update
to authenticated
using ((select public.is_current_operator()))
with check ((select public.is_current_operator()));

drop policy if exists "operators can delete merch products" on public.merch_products;
create policy "operators can delete merch products"
on public.merch_products for delete
to authenticated
using ((select public.is_current_operator()));

grant select, insert, update, delete on public.merch_products to authenticated;
grant select on public.merch_products to anon;
