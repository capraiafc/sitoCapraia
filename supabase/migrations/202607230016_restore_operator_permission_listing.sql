-- Ripristina la firma completa della RPC usata dalla pagina Operatori.
-- Non modifica i dati: espone soltanto i booleani già presenti nella tabella.

drop function if exists public.list_operator_emails();

create function public.list_operator_emails()
returns table (
  email text,
  role text,
  created_at timestamptz,
  can_matches boolean,
  can_players boolean,
  can_news boolean,
  can_sponsors boolean,
  can_bacheca boolean,
  can_merch boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_user() then
    raise exception 'Accesso negato: super user richiesto.' using errcode = '42501';
  end if;

  return query
    select
      o.email,
      o.role,
      o.created_at,
      o.can_matches,
      o.can_players,
      o.can_news,
      o.can_sponsors,
      o.can_bacheca,
      o.can_merch
    from public.operator_allowlist as o
    order by o.email;
end;
$$;

revoke all on function public.list_operator_emails() from public;
grant execute on function public.list_operator_emails() to authenticated;
