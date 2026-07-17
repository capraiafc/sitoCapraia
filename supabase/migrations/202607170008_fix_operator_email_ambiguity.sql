-- Correzione per database che hanno già applicato 20260717_operator_access.sql.
-- Elimina l'ambiguità tra la colonna `email` e il campo restituito dalla RPC.

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
    select allowed_operator.email, allowed_operator.role, allowed_operator.created_at
    from public.operator_allowlist as allowed_operator
    where allowed_operator.email = normalized_email;
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

  if (select count(*) from public.operator_allowlist as allowed_operator where allowed_operator.role = 'operator') <= 1
    and exists (select 1 from public.operator_allowlist as allowed_operator where allowed_operator.email = normalized_email) then
    raise exception 'Non puoi rimuovere l’ultimo operatore abilitato' using errcode = '23514';
  end if;

  delete from public.operator_allowlist as allowed_operator
  where allowed_operator.email = normalized_email;
end;
$$;

revoke all on function public.is_current_operator() from public;
revoke all on function public.add_operator(text) from public;
revoke all on function public.remove_operator(text) from public;
grant execute on function public.is_current_operator() to authenticated;
grant execute on function public.add_operator(text) to authenticated;
grant execute on function public.remove_operator(text) to authenticated;
