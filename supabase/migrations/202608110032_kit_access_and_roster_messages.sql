-- Il magazzino è gestito esclusivamente da Giulio Zaccardo e dall'account
-- della società. Gli altri operatori conservano i rispettivi diritti, ma non
-- possono aprire o modificare l'area Kit.
update public.operator_allowlist
set can_kit = lower(trim(email)) in ('giuliozaccardo@gmail.com', 'capraiafc@gmail.com');

-- Cancellazione recuperabile dei messaggi: non è più mostrata in alcuna vista
-- ma resta registrata per verifiche amministrative.
alter table public.player_messages
  drop constraint if exists player_messages_status_check;
alter table public.player_messages
  add constraint player_messages_status_check check (status in ('new', 'read', 'archived', 'deleted'));
alter table public.player_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create or replace function public.list_player_messages(p_player_id uuid)
returns table (id uuid, player_id uuid, subject text, body text, status text, created_at timestamptz, read_at timestamptz, archived_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if p_player_id is null or (p_player_id <> public.current_player_id() and not public.can_manage_all_players()) then
    raise exception 'Accesso negato ai messaggi del giocatore.' using errcode = '42501';
  end if;
  return query
    select message.id, message.player_id, message.subject, message.body, message.status, message.created_at, message.read_at, message.archived_at
    from public.player_messages message
    where message.player_id = p_player_id and message.status <> 'deleted'
    order by message.created_at desc;
end;
$$;

create or replace function public.list_roster_player_messages(
  p_limit integer default 10,
  p_offset integer default 0,
  p_query text default null
)
returns table (
  id uuid, player_id uuid, player_name text, subject text, body text, status text,
  created_at timestamptz, total_count bigint
)
language plpgsql security definer set search_path = public as $$
declare v_query text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione Rosa richiesta.' using errcode = '42501'; end if;
  if p_limit < 1 or p_limit > 50 or p_offset < 0 then raise exception 'Paginazione non valida.' using errcode = '22023'; end if;
  return query
  select message.id, player.id, player.display_name, message.subject, message.body, message.status,
    message.created_at, count(*) over ()
  from public.player_messages message
  join public.players player on player.id = message.player_id
  where message.status <> 'deleted'
    and (v_query is null or concat_ws(' ', player.display_name, message.subject, message.body) ilike '%' || v_query || '%')
  order by case message.status when 'new' then 0 when 'read' then 1 else 2 end, message.created_at desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.delete_player_message(p_message_id uuid)
returns public.player_messages language plpgsql security definer set search_path = public as $$
declare v_message public.player_messages%rowtype;
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione Rosa richiesta.' using errcode = '42501'; end if;
  update public.player_messages
  set status = 'deleted', deleted_at = now(), deleted_by = auth.uid()
  where id = p_message_id and status <> 'deleted'
  returning * into v_message;
  if not found then raise exception 'Messaggio non trovato o già eliminato.' using errcode = 'P0002'; end if;
  return v_message;
end;
$$;

revoke all on function public.list_roster_player_messages(integer, integer, text), public.delete_player_message(uuid) from public;
grant execute on function public.list_roster_player_messages(integer, integer, text), public.delete_player_message(uuid) to authenticated;
