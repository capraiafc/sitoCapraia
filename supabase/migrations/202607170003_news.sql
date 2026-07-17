-- Capraia FC: news editor. Requires public.is_current_operator().

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  excerpt text check (excerpt is null or char_length(btrim(excerpt)) <= 500),
  content_type text not null default 'original' check (content_type in ('original', 'external')),
  body text,
  external_url text,
  source_name text,
  source_label text,
  cover_image_url text,
  category text not null default 'Club' check (char_length(btrim(category)) between 2 and 60),
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_original_has_body check (content_type <> 'original' or char_length(btrim(coalesce(body, ''))) > 0),
  constraint news_external_has_source check (content_type <> 'external' or (
    external_url ~* '^https?://[^[:space:]]+$'
    and char_length(btrim(coalesce(source_name, ''))) > 0
    and char_length(btrim(coalesce(source_label, ''))) > 0
  ))
);

comment on table public.news is
  'Editorial news. An external item contains a source URL and is shown as a reported link, not copied article text.';

create index if not exists news_publication_idx on public.news (published_at desc, created_at desc) where published = true;

create or replace function public.set_news_updated_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  if new.published and (tg_op = 'INSERT' or not old.published) and new.published_at is null then
    new.published_at = now();
  elsif not new.published then
    new.published_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_news_updated_fields on public.news;
create trigger set_news_updated_fields before insert or update on public.news
for each row execute function public.set_news_updated_fields();

alter table public.news enable row level security;

-- Visitors get published news only. Every operator rule is checked by PostgreSQL.
drop policy if exists "public can read published news" on public.news;
create policy "public can read published news" on public.news for select using (published = true);
drop policy if exists "operators can read all news" on public.news;
create policy "operators can read all news" on public.news for select to authenticated using ((select public.is_current_operator()));
drop policy if exists "operators can create news" on public.news;
create policy "operators can create news" on public.news for insert to authenticated with check ((select public.is_current_operator()));
drop policy if exists "operators can update news" on public.news;
create policy "operators can update news" on public.news for update to authenticated using ((select public.is_current_operator())) with check ((select public.is_current_operator()));
drop policy if exists "operators can delete news" on public.news;
create policy "operators can delete news" on public.news for delete to authenticated using ((select public.is_current_operator()));

grant select, insert, update, delete on public.news to authenticated;
grant select on public.news to anon;
