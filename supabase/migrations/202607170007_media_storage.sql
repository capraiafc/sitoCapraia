-- Archivio media pubblico. Gli upload sono consentiti solo agli operatori.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capraia-media', 'capraia-media', true, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = 6291456, allowed_mime_types = excluded.allowed_mime_types;

alter table public.players add column if not exists image_path text;
alter table public.news add column if not exists cover_image_path text;
alter table public.merch_products add column if not exists image_path text;

drop policy if exists "operators manage capraia media" on storage.objects;
create policy "operators manage capraia media"
on storage.objects for all to authenticated
using (bucket_id = 'capraia-media' and (select public.is_current_operator()))
with check (bucket_id = 'capraia-media' and (select public.is_current_operator()));
