-- Operatore responsabile dei rapporti con ciascuno sponsor.

alter table public.sponsor_private_details
  add column if not exists assigned_operator_email text;

alter table public.sponsor_private_details
  drop constraint if exists sponsor_private_details_assigned_operator_email_fkey;

alter table public.sponsor_private_details
  add constraint sponsor_private_details_assigned_operator_email_fkey
  foreign key (assigned_operator_email)
  references public.operator_allowlist(email)
  on update cascade
  on delete set null;

create or replace function public.validate_sponsor_operator_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_operator_email is not null and not exists (
    select 1
    from public.operator_allowlist as candidate
    where candidate.email = new.assigned_operator_email
      and candidate.role in ('operator', 'admin')
      and (candidate.can_sponsors or candidate.email = 'capraiafc@gmail.com')
  ) then
    raise exception 'Seleziona un operatore abilitato all’area Sponsor.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_sponsor_operator_assignment on public.sponsor_private_details;
create trigger validate_sponsor_operator_assignment
before insert or update of assigned_operator_email on public.sponsor_private_details
for each row execute function public.validate_sponsor_operator_assignment();

create or replace function public.clear_disabled_sponsor_operator_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (new.role in ('operator', 'admin') and (new.can_sponsors or new.email = 'capraiafc@gmail.com')) then
    update public.sponsor_private_details
    set assigned_operator_email = null
    where assigned_operator_email = new.email;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_disabled_sponsor_operator_assignments on public.operator_allowlist;
create trigger clear_disabled_sponsor_operator_assignments
after update of role, can_sponsors on public.operator_allowlist
for each row execute function public.clear_disabled_sponsor_operator_assignments();

create or replace function public.list_sponsor_operator_candidates()
returns table (
  operator_email text,
  operator_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_admin_area_access('sponsors') then
    raise exception 'Accesso negato: area Sponsor richiesta.' using errcode = '42501';
  end if;

  return query
    select
      candidate.email,
      coalesce(player.display_name, candidate.email)
    from public.operator_allowlist as candidate
    left join public.players as player on player.id = candidate.player_id
    where candidate.role in ('operator', 'admin')
      and (
        candidate.can_sponsors
        or candidate.email = 'capraiafc@gmail.com'
      )
    order by
      case when candidate.email = 'capraiafc@gmail.com' then 0 else 1 end,
      coalesce(player.display_name, candidate.email);
end;
$$;

revoke all on function public.list_sponsor_operator_candidates() from public;
grant execute on function public.list_sponsor_operator_candidates() to authenticated;
