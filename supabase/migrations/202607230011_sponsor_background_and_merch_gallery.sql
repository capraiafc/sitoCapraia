-- Sfondo dei loghi sponsor e galleria fotografica del merchandising.

alter table public.sponsors
  add column if not exists logo_background text not null default 'blue-yellow';

alter table public.sponsors
  drop constraint if exists sponsors_logo_background_check;

alter table public.sponsors
  add constraint sponsors_logo_background_check
  check (logo_background in ('yellow-white', 'blue-yellow'));

create table if not exists public.merch_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.merch_products(id) on delete cascade,
  image_url text not null check (image_url ~* '^https?://[^[:space:]]+$'),
  image_path text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists merch_product_images_one_primary_idx
  on public.merch_product_images (product_id)
  where is_primary = true;

create index if not exists merch_product_images_order_idx
  on public.merch_product_images (product_id, sort_order, created_at);

-- Porta nella nuova galleria l'eventuale immagine già inserita nel catalogo.
insert into public.merch_product_images (product_id, image_url, image_path, is_primary)
select p.id, p.image_url, p.image_path, true
from public.merch_products p
where p.image_url is not null
  and not exists (
    select 1 from public.merch_product_images i where i.product_id = p.id
  );

alter table public.merch_product_images enable row level security;

drop policy if exists "public can read images of published merch" on public.merch_product_images;
create policy "public can read images of published merch"
on public.merch_product_images for select
using (exists (
  select 1 from public.merch_products p where p.id = product_id and p.published = true
));

drop policy if exists "operators can read all merch images" on public.merch_product_images;
create policy "operators can read all merch images"
on public.merch_product_images for select to authenticated
using ((select public.is_current_operator()));
drop policy if exists "operators can create merch images" on public.merch_product_images;
create policy "operators can create merch images"
on public.merch_product_images for insert to authenticated
with check ((select public.is_current_operator()));
drop policy if exists "operators can update merch images" on public.merch_product_images;
create policy "operators can update merch images"
on public.merch_product_images for update to authenticated
using ((select public.is_current_operator())) with check ((select public.is_current_operator()));
drop policy if exists "operators can delete merch images" on public.merch_product_images;
create policy "operators can delete merch images"
on public.merch_product_images for delete to authenticated
using ((select public.is_current_operator()));

grant select on public.merch_product_images to anon;
grant select, insert, update, delete on public.merch_product_images to authenticated;
