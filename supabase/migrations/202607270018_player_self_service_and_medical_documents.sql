-- Scheda personale dei calciatori e archivio privato delle visite mediche.
-- Prerequisito: 202607270017_player_private_data_and_medical_reminders.sql.

alter table public.operator_allowlist
  add column if not exists player_id uuid references public.players(id) on delete set null;

create unique index if not exists operator_allowlist_player_id_key
  on public.operator_allowlist (player_id)
  where player_id is not null;

alter table public.player_private_details
  add column if not exists medical_document_path text,
  add column if not exists medical_document_name text,
  add column if not exists medical_document_mime_type text,
  add column if not exists medical_document_size bigint,
  add column if not exists medical_document_uploaded_at timestamptz;

alter table public.player_private_details
  drop constraint if exists player_private_details_medical_document_mime_type_check;
alter table public.player_private_details
  add constraint player_private_details_medical_document_mime_type_check
  check (
    medical_document_mime_type is null
    or medical_document_mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  );

alter table public.player_private_details
  drop constraint if exists player_private_details_medical_document_size_check;
alter table public.player_private_details
  add constraint player_private_details_medical_document_size_check
  check (medical_document_size is null or medical_document_size between 1 and 10485760);

alter table public.player_private_details
  drop constraint if exists player_private_details_medical_document_metadata_check;
alter table public.player_private_details
  add constraint player_private_details_medical_document_metadata_check
  check (
    medical_document_path is null
    or (
      medical_document_name is not null
      and medical_document_mime_type is not null
      and medical_document_size is not null
      and medical_document_uploaded_at is not null
    )
  );

create or replace function public.require_new_medical_document_for_expiry_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.medical_document_path is not null
    and new.medical_document_path not like new.player_id::text || '/%' then
    raise exception 'Percorso documento non valido.' using errcode = '22023';
  end if;

  if new.medical_document_path is distinct from old.medical_document_path
    and new.medical_document_path is not null
    and not exists (
      select 1
      from storage.objects as medical_object
      where medical_object.bucket_id = 'capraia-medical-visits'
        and medical_object.name = new.medical_document_path
    ) then
    raise exception 'Il documento caricato non è stato trovato nell’archivio privato.' using errcode = '22023';
  end if;

  if auth.uid() is not null
    and new.medical_exam_expiry is distinct from old.medical_exam_expiry
    and (
      new.medical_document_path is null
      or new.medical_document_path is not distinct from old.medical_document_path
    ) then
    raise exception 'Per cambiare la scadenza devi caricare il nuovo documento della visita.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists require_new_medical_document_for_expiry_change on public.player_private_details;
create trigger require_new_medical_document_for_expiry_change
before update on public.player_private_details
for each row execute function public.require_new_medical_document_for_expiry_change();

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

alter table public.player_medical_reminder_events
  drop constraint if exists player_medical_reminder_events_reminder_days_check;
alter table public.player_medical_reminder_events
  add constraint player_medical_reminder_events_reminder_days_check
  check (reminder_days in (0, 10, 30));

create or replace function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.player_id
  from public.operator_allowlist as o
  where o.email = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    and o.role in ('operator', 'admin')
    and o.can_players
    and o.player_id is not null
  limit 1;
$$;

create or replace function public.can_manage_all_players()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_user() or exists (
    select 1
    from public.operator_allowlist as o
    where o.email = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      and o.role in ('operator', 'admin')
      and o.can_players
      and o.player_id is null
  );
$$;

create or replace function public.current_admin_permissions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_operator', public.is_current_operator(),
    'is_super_user', public.is_super_user(),
    'can_matches', public.has_admin_area_access('matches'),
    'can_players', public.has_admin_area_access('players'),
    'can_news', public.has_admin_area_access('news'),
    'can_sponsors', public.has_admin_area_access('sponsors'),
    'can_bacheca', public.has_admin_area_access('bacheca'),
    'can_merch', public.has_admin_area_access('merch'),
    'player_id', public.current_player_id(),
    'is_player_self_service', public.current_player_id() is not null
  );
$$;

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
  can_merch boolean,
  player_id uuid,
  player_name text
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
      o.can_merch,
      o.player_id,
      p.display_name
    from public.operator_allowlist as o
    left join public.players as p on p.id = o.player_id
    order by o.email;
end;
$$;

-- Gli operatori della Rosa vedono tutto; il calciatore vede soltanto i dati
-- privati collegati al proprio account Google.
drop policy if exists "players operators can read private details" on public.player_private_details;
drop policy if exists "players operators can create private details" on public.player_private_details;
drop policy if exists "players operators can update private details" on public.player_private_details;
drop policy if exists "players operators can delete private details" on public.player_private_details;
drop policy if exists "roster managers read private details" on public.player_private_details;
drop policy if exists "players read own private details" on public.player_private_details;
drop policy if exists "roster managers create private details" on public.player_private_details;
drop policy if exists "roster managers update private details" on public.player_private_details;
drop policy if exists "roster managers delete private details" on public.player_private_details;

create policy "roster managers read private details"
on public.player_private_details for select to authenticated
using ((select public.can_manage_all_players()));

create policy "players read own private details"
on public.player_private_details for select to authenticated
using (player_id = (select public.current_player_id()));

create policy "roster managers create private details"
on public.player_private_details for insert to authenticated
with check ((select public.can_manage_all_players()));

create policy "roster managers update private details"
on public.player_private_details for update to authenticated
using ((select public.can_manage_all_players()))
with check ((select public.can_manage_all_players()));

create policy "roster managers delete private details"
on public.player_private_details for delete to authenticated
using ((select public.can_manage_all_players()));

drop policy if exists "players operators can read medical reminders" on public.player_medical_reminder_events;
drop policy if exists "roster managers read medical reminders" on public.player_medical_reminder_events;
create policy "roster managers read medical reminders"
on public.player_medical_reminder_events for select to authenticated
using ((select public.can_manage_all_players()));

-- I calciatori possono leggere la propria scheda anche se si sono ritirati
-- dalla rosa pubblica. Le scritture sulla tabella pubblica restano vietate.
drop policy if exists "players read own roster profile" on public.players;
create policy "players read own roster profile"
on public.players for select to authenticated
using (id = (select public.current_player_id()));

drop policy if exists "operators can read all players" on public.players;
drop policy if exists "operators can create players" on public.players;
drop policy if exists "operators can update players" on public.players;
drop policy if exists "operators can delete players" on public.players;
drop policy if exists "roster managers read all players" on public.players;
drop policy if exists "roster managers create players" on public.players;
drop policy if exists "roster managers update players" on public.players;
drop policy if exists "roster managers delete players" on public.players;

create policy "roster managers read all players"
on public.players for select to authenticated
using ((select public.can_manage_all_players()));

create policy "roster managers create players"
on public.players for insert to authenticated
with check ((select public.can_manage_all_players()));

create policy "roster managers update players"
on public.players for update to authenticated
using ((select public.can_manage_all_players()))
with check ((select public.can_manage_all_players()));

create policy "roster managers delete players"
on public.players for delete to authenticated
using ((select public.can_manage_all_players()));

-- Funzioni ristrette per le sole modifiche consentite al calciatore.
create or replace function public.update_own_player_profile(
  p_kit_size text,
  p_medical_exam_expiry date,
  p_medical_document_path text default null,
  p_medical_document_name text default null,
  p_medical_document_mime_type text default null,
  p_medical_document_size bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid := public.current_player_id();
  v_existing public.player_private_details%rowtype;
  v_kit_size text := nullif(trim(coalesce(p_kit_size, '')), '');
begin
  if v_player_id is null then
    raise exception 'Accesso negato: scheda giocatore non collegata.' using errcode = '42501';
  end if;
  if v_kit_size is not null and char_length(v_kit_size) > 40 then
    raise exception 'La taglia del kit è troppo lunga.' using errcode = '22023';
  end if;
  if p_medical_exam_expiry is null then
    raise exception 'Inserisci la data di scadenza della visita medica.' using errcode = '22023';
  end if;

  select * into v_existing
  from public.player_private_details
  where player_id = v_player_id;

  if not found and p_medical_document_path is null then
    raise exception 'Per registrare la visita devi caricare il documento.' using errcode = '22023';
  end if;

  if found
    and p_medical_exam_expiry is distinct from v_existing.medical_exam_expiry
    and (
      p_medical_document_path is null
      or p_medical_document_path is not distinct from v_existing.medical_document_path
    ) then
    raise exception 'Per cambiare la scadenza devi caricare il nuovo documento della visita.' using errcode = '22023';
  end if;

  if p_medical_document_path is not null
    and p_medical_document_path not like v_player_id::text || '/%' then
    raise exception 'Percorso documento non valido.' using errcode = '22023';
  end if;

  insert into public.player_private_details (
    player_id,
    kit_size,
    medical_exam_expiry,
    medical_document_path,
    medical_document_name,
    medical_document_mime_type,
    medical_document_size,
    medical_document_uploaded_at,
    created_by,
    updated_by
  ) values (
    v_player_id,
    v_kit_size,
    p_medical_exam_expiry,
    p_medical_document_path,
    p_medical_document_name,
    p_medical_document_mime_type,
    p_medical_document_size,
    case when p_medical_document_path is null then null else now() end,
    auth.uid(),
    auth.uid()
  )
  on conflict (player_id) do update
  set
    kit_size = excluded.kit_size,
    medical_exam_expiry = excluded.medical_exam_expiry,
    medical_document_path = coalesce(excluded.medical_document_path, player_private_details.medical_document_path),
    medical_document_name = coalesce(excluded.medical_document_name, player_private_details.medical_document_name),
    medical_document_mime_type = coalesce(excluded.medical_document_mime_type, player_private_details.medical_document_mime_type),
    medical_document_size = coalesce(excluded.medical_document_size, player_private_details.medical_document_size),
    medical_document_uploaded_at = case
      when excluded.medical_document_path is null then player_private_details.medical_document_uploaded_at
      else now()
    end,
    updated_by = auth.uid(),
    updated_at = now();
end;
$$;

create or replace function public.withdraw_own_player()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id uuid := public.current_player_id();
begin
  if v_player_id is null then
    raise exception 'Accesso negato: scheda giocatore non collegata.' using errcode = '42501';
  end if;

  update public.players
  set status = 'former', published = false, updated_by = auth.uid(), updated_at = now()
  where id = v_player_id;
end;
$$;

-- Archivio privato. I file non hanno URL pubblico e vengono scaricati soltanto
-- tramite una sessione autenticata autorizzata.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capraia-medical-visits',
  'capraia-medical-visits',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "roster managers and players read medical documents" on storage.objects;
drop policy if exists "roster managers and players upload medical documents" on storage.objects;
drop policy if exists "roster managers and players delete medical documents" on storage.objects;

create policy "roster managers and players read medical documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'capraia-medical-visits'
  and (
    (select public.can_manage_all_players())
    or (storage.foldername(name))[1] = (select public.current_player_id())::text
  )
);

create policy "roster managers and players upload medical documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'capraia-medical-visits'
  and (
    (select public.can_manage_all_players())
    or (storage.foldername(name))[1] = (select public.current_player_id())::text
  )
);

create policy "roster managers and players delete medical documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'capraia-medical-visits'
  and (
    (select public.can_manage_all_players())
    or (storage.foldername(name))[1] = (select public.current_player_id())::text
  )
);

revoke all on function public.current_player_id() from public;
revoke all on function public.can_manage_all_players() from public;
revoke all on function public.current_admin_permissions() from public;
revoke all on function public.list_operator_emails() from public;
revoke all on function public.update_own_player_profile(text, date, text, text, text, bigint) from public;
revoke all on function public.withdraw_own_player() from public;

grant execute on function public.current_player_id() to authenticated;
grant execute on function public.can_manage_all_players() to authenticated;
grant execute on function public.current_admin_permissions() to authenticated;
grant execute on function public.list_operator_emails() to authenticated;
grant execute on function public.update_own_player_profile(text, date, text, text, text, bigint) to authenticated;
grant execute on function public.withdraw_own_player() to authenticated;
