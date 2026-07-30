-- Al primo rinnovo delle tessere storiche registra anche la data di prima
-- iscrizione. I rinnovi successivi conservano sempre il dato già presente.

drop function if exists public.renew_member(uuid, numeric, text, uuid);
drop function if exists public.renew_member(uuid, numeric, text, uuid, date);

create function public.renew_member(
  p_member_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_request_id uuid,
  p_member_since date default null
)
returns public.members
language plpgsql security definer set search_path = public
as $$
declare
  v_member public.members%rowtype;
  v_existing_member_id uuid;
  v_season text := public.membership_current_season();
  v_method text := nullif(trim(coalesce(p_payment_method, '')), '');
begin
  if not public.has_admin_area_access('members') then
    raise exception 'Accesso negato: area Tesserati richiesta.' using errcode = '42501';
  end if;
  if p_member_id is null or p_request_id is null then
    raise exception 'Tessera e richiesta sono obbligatorie.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 99999999.99 or v_method is null or char_length(v_method) > 80 then
    raise exception 'Inserisci importo positivo e metodo di pagamento valido.' using errcode = '22023';
  end if;
  if p_member_since is not null and p_member_since > (now() at time zone 'Europe/Rome')::date then
    raise exception 'La data socio dal non può essere futura.' using errcode = '22023';
  end if;

  select member_id into v_existing_member_id from public.member_renewal_events where request_id = p_request_id;
  if found then
    if v_existing_member_id <> p_member_id then raise exception 'Identificativo richiesta già usato.' using errcode = '23505'; end if;
    select * into v_member from public.members where id = p_member_id;
    return v_member;
  end if;

  select * into v_member from public.members where id = p_member_id for update;
  if not found then raise exception 'Tesserato non trovato.' using errcode = 'P0002'; end if;
  if v_member.member_since is null and p_member_since is null then
    raise exception 'Inserisci la data Socio dal per questa tessera.' using errcode = '22023';
  end if;
  if v_member.renewed_current_season and v_member.renewal_season = v_season then
    raise exception 'Il tesserato ha già rinnovato per la stagione %.', v_season using errcode = '23514';
  end if;

  update public.members
  set renewed_current_season = true, paid = true, payment_method = v_method,
      renewal_total = round(p_amount, 2), renewal_season = v_season, renewed_at = now(),
      member_since = coalesce(member_since, p_member_since)
  where id = p_member_id
  returning * into v_member;

  insert into public.member_renewal_events (member_id, season, amount, payment_method, request_id, renewed_by)
  values (p_member_id, v_season, round(p_amount, 2), v_method, p_request_id, auth.uid());
  return v_member;
end;
$$;

revoke all on function public.renew_member(uuid, numeric, text, uuid, date) from public;
grant execute on function public.renew_member(uuid, numeric, text, uuid, date) to authenticated;
