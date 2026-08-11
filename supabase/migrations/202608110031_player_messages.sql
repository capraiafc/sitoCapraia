-- Messaggi diretti tra giocatore e società. Le operazioni passano da RPC per
-- impedire che un account possa scegliere o modificare la scheda di un altro.

create table if not exists public.player_messages (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  player_id uuid not null references public.players(id) on delete cascade,
  subject text check (subject is null or char_length(trim(subject)) between 1 and 120),
  body text not null check (char_length(trim(body)) between 5 and 2000),
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create index if not exists player_messages_player_created_idx on public.player_messages (player_id, created_at desc);
create index if not exists player_messages_new_idx on public.player_messages (player_id, created_at desc) where status = 'new';

alter table public.player_messages enable row level security;
revoke all on public.player_messages from anon, authenticated;

create or replace function public.send_my_player_message(
  p_subject text,
  p_body text,
  p_request_key uuid
)
returns public.player_messages
language plpgsql security definer set search_path = public as $$
declare
  v_player_id uuid := public.current_player_id();
  v_subject text := nullif(trim(coalesce(p_subject, '')), '');
  v_body text := trim(coalesce(p_body, ''));
  v_message public.player_messages%rowtype;
begin
  if v_player_id is null then raise exception 'Accesso negato: scheda giocatore non collegata.' using errcode = '42501'; end if;
  if p_request_key is null or char_length(v_body) < 5 or char_length(v_body) > 2000 or (v_subject is not null and char_length(v_subject) > 120) then
    raise exception 'Inserisci un messaggio da 5 a 2.000 caratteri e un oggetto di massimo 120 caratteri.' using errcode = '22023';
  end if;
  select * into v_message from public.player_messages where request_key = p_request_key;
  if found then
    if v_message.player_id <> v_player_id then raise exception 'Identificativo messaggio già utilizzato.' using errcode = '23505'; end if;
    return v_message;
  end if;
  insert into public.player_messages (request_key, player_id, subject, body)
  values (p_request_key, v_player_id, v_subject, v_body)
  returning * into v_message;
  return v_message;
end;
$$;

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
    where message.player_id = p_player_id
    order by message.created_at desc;
end;
$$;

create or replace function public.mark_player_messages_read(p_player_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_updated integer;
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione Rosa richiesta.' using errcode = '42501'; end if;
  update public.player_messages set status = 'read', read_at = now(), read_by = auth.uid()
  where player_id = p_player_id and status = 'new';
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.archive_player_message(p_message_id uuid)
returns public.player_messages language plpgsql security definer set search_path = public as $$
declare v_message public.player_messages%rowtype;
begin
  if not public.can_manage_all_players() then raise exception 'Accesso negato: gestione Rosa richiesta.' using errcode = '42501'; end if;
  update public.player_messages set status = 'archived', archived_at = now(), archived_by = auth.uid()
  where id = p_message_id returning * into v_message;
  if not found then raise exception 'Messaggio non trovato.' using errcode = 'P0002'; end if;
  return v_message;
end;
$$;

revoke all on function public.send_my_player_message(text, text, uuid), public.list_player_messages(uuid), public.mark_player_messages_read(uuid), public.archive_player_message(uuid) from public;
grant execute on function public.send_my_player_message(text, text, uuid), public.list_player_messages(uuid), public.mark_player_messages_read(uuid), public.archive_player_message(uuid) to authenticated;
