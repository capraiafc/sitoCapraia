-- Capraia FC: operator access control
-- Apply this migration in the Supabase SQL editor (or with the Supabase CLI)
-- before deploying the operator dashboard.  Google Auth must be enabled in
-- Supabase Auth separately.

create table if not exists public.operator_allowlist (
  email text primary key,
  role text not null default 'operator' check (role in ('operator', 'admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint operator_allowlist_normalized_email check (email = lower(trim(email)))
);

comment on table public.operator_allowlist is
  'Server-side allowlist for the Capraia FC operator area. Never expose write access directly to browser clients.';

-- The only initial operator. Do not add other addresses in a migration.
insert into public.operator_allowlist (email, role)
values ('capraiafc@gmail.com', 'operator')
on conflict (email) do nothing;

alter table public.operator_allowlist enable row level security;

-- All browser access goes through the RPCs below.  This prevents a user from
-- reading or changing the allowlist simply by using the public API.
revoke all on table public.operator_allowlist from anon, authenticated;

create or replace function public.is_current_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operator_allowlist as allowed_operator
    where allowed_operator.email = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and allowed_operator.role in ('operator', 'admin')
  );
$$;

create or replace function public.list_operator_emails()
returns table (
  email text,
  role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_current_operator() then
    raise exception 'Accesso negato: account operatore richiesto' using errcode = '42501';
  end if;

  return query
    select o.email, o.role, o.created_at
    from public.operator_allowlist o
    order by o.email;
end;
$$;

create or replace function public.add_operator(operator_email text)
returns table (
  email text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(operator_email));
begin
  if not public.is_current_operator() then
    raise exception 'Accesso negato: account operatore richiesto' using errcode = '42501';
  end if;

  if normalized_email = ''
    or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Inserisci un indirizzo email valido' using errcode = '22023';
  end if;

  insert into public.operator_allowlist (email, role, created_by)
  values (normalized_email, 'operator', auth.uid())
  on conflict on constraint operator_allowlist_pkey do nothing;

  return query
    select o.email, o.role, o.created_at
    from public.operator_allowlist o
    where o.email = normalized_email;
end;
$$;

create or replace function public.remove_operator(operator_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(operator_email));
begin
  if not public.is_current_operator() then
    raise exception 'Accesso negato: account operatore richiesto' using errcode = '42501';
  end if;

  -- Keep at least one operator, so the back office cannot be permanently
  -- locked by an accidental deletion.
  if (select count(*) from public.operator_allowlist as allowed_operator where allowed_operator.role = 'operator') <= 1
    and exists (select 1 from public.operator_allowlist as allowed_operator where allowed_operator.email = normalized_email) then
    raise exception 'Non puoi rimuovere l’ultimo operatore abilitato' using errcode = '23514';
  end if;

  delete from public.operator_allowlist as allowed_operator where allowed_operator.email = normalized_email;
end;
$$;

revoke all on function public.is_current_operator() from public;
revoke all on function public.list_operator_emails() from public;
revoke all on function public.add_operator(text) from public;
revoke all on function public.remove_operator(text) from public;
grant execute on function public.is_current_operator() to authenticated;
grant execute on function public.list_operator_emails() to authenticated;
grant execute on function public.add_operator(text) to authenticated;
grant execute on function public.remove_operator(text) to authenticated;
