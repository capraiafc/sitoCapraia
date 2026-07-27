-- Quando cambia l'email di un giocatore, ricrea il relativo accesso operatore.
-- Questa migrazione sostituisce la prima versione del trigger introdotta nella 018.

create or replace function public.sync_player_operator_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not distinct from old.email then
    return new;
  end if;

  if new.email is not null and exists (
    select 1
    from public.operator_allowlist as existing_operator
    where existing_operator.email = lower(trim(new.email))
      and existing_operator.player_id is not null
      and existing_operator.player_id <> new.player_id
  ) then
    raise exception 'La nuova email è già collegata a un altro giocatore.' using errcode = '23505';
  end if;

  delete from public.operator_allowlist as old_operator
  where old_operator.player_id = new.player_id
     or (old.email is not null and old_operator.email = lower(trim(old.email)));

  if new.email is not null then
    insert into public.operator_allowlist (
      email, role, created_by, can_matches, can_players, can_news,
      can_sponsors, can_bacheca, can_merch, player_id
    ) values (
      lower(trim(new.email)), 'operator', auth.uid(), false, true, false,
      false, false, false, new.player_id
    )
    on conflict (email) do update
    set
      role = 'operator',
      can_matches = false,
      can_players = true,
      can_news = false,
      can_sponsors = false,
      can_bacheca = false,
      can_merch = false,
      player_id = excluded.player_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_player_operator_email on public.player_private_details;
create trigger sync_player_operator_email
after update of email on public.player_private_details
for each row execute function public.sync_player_operator_email();
