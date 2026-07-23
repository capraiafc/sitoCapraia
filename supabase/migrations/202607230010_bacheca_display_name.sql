-- Compatibilità per gli ambienti in cui la migrazione della bacheca era già stata applicata.

alter table public.bacheca_messages
  add column if not exists display_name text not null default 'Tifoso';

alter table public.bacheca_messages
  drop constraint if exists bacheca_messages_display_name_check;

alter table public.bacheca_messages
  add constraint bacheca_messages_display_name_check
  check (char_length(btrim(display_name)) between 1 and 80);
