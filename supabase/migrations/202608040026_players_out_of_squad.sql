-- Un giocatore fuori rosa viene mantenuto nell'archivio, ma non partecipa
-- alle logiche sportive, alla rosa pubblica e ai rinnovi della visita medica.

alter table public.players
  add column if not exists out_of_squad boolean not null default false;

comment on column public.players.out_of_squad is
  'Esclude il giocatore da rosa, dashboard e gestione della visita medica senza cancellarne l''anagrafica.';

create index if not exists players_out_of_squad_idx
  on public.players (out_of_squad)
  where out_of_squad = true;

-- Un giocatore segnato fuori rosa non può aggiornare autonomamente la
-- scadenza o il documento della visita, nemmeno passando direttamente dalla
-- funzione RPC.
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
  v_out_of_squad boolean;
begin
  if v_player_id is null then
    raise exception 'Accesso negato: scheda giocatore non collegata.' using errcode = '42501';
  end if;

  select out_of_squad into v_out_of_squad from public.players where id = v_player_id;
  if coalesce(v_out_of_squad, true) then
    raise exception 'La gestione della visita medica non è disponibile per un giocatore fuori rosa.' using errcode = '42501';
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
    player_id, kit_size, medical_exam_expiry, medical_document_path,
    medical_document_name, medical_document_mime_type, medical_document_size,
    medical_document_uploaded_at, created_by, updated_by
  ) values (
    v_player_id, v_kit_size, p_medical_exam_expiry, p_medical_document_path,
    p_medical_document_name, p_medical_document_mime_type, p_medical_document_size,
    case when p_medical_document_path is null then null else now() end,
    auth.uid(), auth.uid()
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

revoke all on function public.update_own_player_profile(text, date, text, text, text, bigint) from public;
grant execute on function public.update_own_player_profile(text, date, text, text, text, bigint) to authenticated;
