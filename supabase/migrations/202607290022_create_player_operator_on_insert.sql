-- Crea immediatamente l'accesso operatore quando viene inserita la scheda
-- privata di un nuovo giocatore. Gli altri permessi eventualmente già
-- assegnati alla stessa email vengono mantenuti.

create or replace function public.sync_player_operator_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := nullif(lower(trim(new.email)), '');
  previous_email text;
begin
  if tg_op = 'UPDATE' then
    previous_email := nullif(lower(trim(old.email)), '');
  end if;

  if tg_op = 'UPDATE' and normalized_email is not distinct from previous_email then
    return new;
  end if;

  if normalized_email is not null and exists (
    select 1
    from public.operator_allowlist as existing_operator
    where existing_operator.email = normalized_email
      and existing_operator.player_id is not null
      and existing_operator.player_id <> new.player_id
  ) then
    raise exception 'La nuova email è già collegata a un altro giocatore.' using errcode = '23505';
  end if;

  -- Elimina un eventuale vecchio collegamento dello stesso giocatore.
  delete from public.operator_allowlist as old_operator
  where old_operator.player_id = new.player_id
    and (normalized_email is null or old_operator.email <> normalized_email);

  -- Quando cambia l'email, elimina anche la precedente voce della allowlist.
  if previous_email is not null and previous_email is distinct from normalized_email then
    delete from public.operator_allowlist as old_operator
    where old_operator.email = previous_email;
  end if;

  if normalized_email is not null then
    insert into public.operator_allowlist (
      email, role, created_by, can_matches, can_players, can_news,
      can_sponsors, can_bacheca, can_merch, player_id
    ) values (
      normalized_email, 'operator', auth.uid(), false, true, false,
      false, false, false, new.player_id
    )
    on conflict (email) do update
    set
      can_players = true,
      player_id = excluded.player_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_player_operator_email on public.player_private_details;
create trigger sync_player_operator_email
after insert or update of email on public.player_private_details
for each row execute function public.sync_player_operator_email();
