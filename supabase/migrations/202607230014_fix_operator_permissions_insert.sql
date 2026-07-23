-- Evita l'ambiguità tra il campo restituito `email` e il bersaglio ON CONFLICT.

create or replace function public.add_operator(operator_email text, p_can_matches boolean default false, p_can_players boolean default false, p_can_news boolean default false, p_can_sponsors boolean default false, p_can_bacheca boolean default false, p_can_merch boolean default false)
returns table (email text, role text, created_at timestamptz, can_matches boolean, can_players boolean, can_news boolean, can_sponsors boolean, can_bacheca boolean, can_merch boolean)
language plpgsql security definer set search_path = public as $$
declare normalized_email text := lower(trim(operator_email));
begin
  if not public.is_super_user() then raise exception 'Accesso negato: super user richiesto.' using errcode = '42501'; end if;
  if normalized_email = '' or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Inserisci un indirizzo email valido.' using errcode = '22023'; end if;
  insert into public.operator_allowlist (email, role, created_by, can_matches, can_players, can_news, can_sponsors, can_bacheca, can_merch)
  values (normalized_email, 'operator', auth.uid(), p_can_matches, p_can_players, p_can_news, p_can_sponsors, p_can_bacheca, p_can_merch)
  on conflict on constraint operator_allowlist_pkey do update
  set can_matches = excluded.can_matches, can_players = excluded.can_players, can_news = excluded.can_news, can_sponsors = excluded.can_sponsors, can_bacheca = excluded.can_bacheca, can_merch = excluded.can_merch;
  return query select o.email, o.role, o.created_at, o.can_matches, o.can_players, o.can_news, o.can_sponsors, o.can_bacheca, o.can_merch from public.operator_allowlist o where o.email = normalized_email;
end;
$$;
