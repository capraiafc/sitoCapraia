-- Contatti privati e pagamenti effettivi degli sponsor.
-- La stagione sportiva viene calcolata lato applicazione dal 1 luglio al 30 giugno.

create table if not exists public.sponsor_private_details (
  sponsor_id uuid primary key references public.sponsors(id) on delete cascade,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_private_details_contact_email_check check (
    contact_email is null
    or (
      char_length(btrim(contact_email)) between 3 and 254
      and position('@' in contact_email) > 1
    )
  )
);

create table if not exists public.sponsor_payments (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  payment_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists sponsor_payments_sponsor_date_idx
  on public.sponsor_payments (sponsor_id, payment_date desc, created_at desc);

create index if not exists sponsor_payments_date_idx
  on public.sponsor_payments (payment_date desc);

create or replace function public.set_sponsor_private_details_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.contact_email = nullif(lower(btrim(new.contact_email)), '');
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sponsor_private_details_updated_at on public.sponsor_private_details;
create trigger set_sponsor_private_details_updated_at
before insert or update on public.sponsor_private_details
for each row execute function public.set_sponsor_private_details_updated_at();

alter table public.sponsor_private_details enable row level security;
alter table public.sponsor_payments enable row level security;

drop policy if exists "sponsor operators read private details" on public.sponsor_private_details;
drop policy if exists "sponsor operators create private details" on public.sponsor_private_details;
drop policy if exists "sponsor operators update private details" on public.sponsor_private_details;
drop policy if exists "sponsor operators delete private details" on public.sponsor_private_details;

create policy "sponsor operators read private details"
on public.sponsor_private_details for select to authenticated
using ((select public.has_admin_area_access('sponsors')));

create policy "sponsor operators create private details"
on public.sponsor_private_details for insert to authenticated
with check ((select public.has_admin_area_access('sponsors')));

create policy "sponsor operators update private details"
on public.sponsor_private_details for update to authenticated
using ((select public.has_admin_area_access('sponsors')))
with check ((select public.has_admin_area_access('sponsors')));

create policy "sponsor operators delete private details"
on public.sponsor_private_details for delete to authenticated
using ((select public.has_admin_area_access('sponsors')));

drop policy if exists "sponsor operators read payments" on public.sponsor_payments;
drop policy if exists "sponsor operators create payments" on public.sponsor_payments;
drop policy if exists "sponsor operators update payments" on public.sponsor_payments;
drop policy if exists "sponsor operators delete payments" on public.sponsor_payments;

create policy "sponsor operators read payments"
on public.sponsor_payments for select to authenticated
using ((select public.has_admin_area_access('sponsors')));

create policy "sponsor operators create payments"
on public.sponsor_payments for insert to authenticated
with check ((select public.has_admin_area_access('sponsors')));

create policy "sponsor operators update payments"
on public.sponsor_payments for update to authenticated
using ((select public.has_admin_area_access('sponsors')))
with check ((select public.has_admin_area_access('sponsors')));

create policy "sponsor operators delete payments"
on public.sponsor_payments for delete to authenticated
using ((select public.has_admin_area_access('sponsors')));

grant select, insert, update, delete on public.sponsor_private_details to authenticated;
grant select, insert, update, delete on public.sponsor_payments to authenticated;

-- Mantiene coerenti le azioni dello storico anche nelle installazioni che
-- conservano ancora la prima versione della funzione di audit.
create or replace function public.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  label text;
  audit_action text := case tg_op
    when 'INSERT' then 'create'
    when 'UPDATE' then 'update'
    when 'DELETE' then 'delete'
  end;
begin
  if not public.is_current_operator() then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  label := coalesce(
    row_data ->> 'name',
    row_data ->> 'title',
    row_data ->> 'display_name',
    nullif(concat_ws(' — ', row_data ->> 'home_team', row_data ->> 'away_team'), '')
  );
  insert into public.admin_action_events (
    operator_email, operator_id, area, action, entity_id, entity_label
  ) values (
    lower(trim(auth.jwt() ->> 'email')), auth.uid(), tg_argv[0], audit_action,
    row_data ->> 'id', label
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists audit_sponsor_private_details_changes on public.sponsor_private_details;
create trigger audit_sponsor_private_details_changes
after insert or update or delete on public.sponsor_private_details
for each row execute function public.audit_admin_change('sponsors');

drop trigger if exists audit_sponsor_payments_changes on public.sponsor_payments;
create trigger audit_sponsor_payments_changes
after insert or update or delete on public.sponsor_payments
for each row execute function public.audit_admin_change('sponsors');
