-- Reverses 0360_team_premium_seats.sql.
--
-- Cost: every Premium seat assignment and every paid-through date is destroyed,
-- and the stored Premium seat count with them. Stripe keeps billing the Premium
-- line item, so a team that pays for Premium seats is served Standard limits
-- until the forward migration is applied again and the next subscription event
-- restores the count. Reassign the seats by hand afterwards.

begin;

drop trigger if exists guard_premium_paid_through on public.organization_members;
drop function if exists public.guard_premium_paid_through();
drop trigger if exists guard_premium_seat_assignment on public.organization_members;
drop function if exists public.guard_premium_seat_assignment();

create or replace function public.guard_organization_seat_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'app_rls' then
    if new.seats_consumed is distinct from old.seats_consumed then
      raise exception 'seats_consumed is maintained by triggers and cannot be written directly'
        using errcode = 'insufficient_privilege';
    end if;
    if new.licensed_seats is distinct from old.licensed_seats then
      raise exception 'licensed_seats is written by billing provisioning, not by the application'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop index if exists public.idx_org_members_premium_seats;

alter table public.organization_members
  drop constraint if exists organization_members_seat_type_known;
alter table public.organizations
  drop constraint if exists organizations_licensed_premium_seats_non_negative;

alter table public.organization_members drop column if exists premium_paid_through;
alter table public.organization_members drop column if exists seat_type_changed_at;
update public.organization_members set seat_type = 'full';
set constraints all immediate;
alter table public.organization_members
  alter column seat_type set default 'full';
alter table public.organization_members
  add constraint organization_members_seat_type_check
  check (seat_type = any (array['full', 'limited', 'guest']));
alter table public.organizations drop column if exists licensed_premium_seats;

delete from public.schema_migrations
 where filename = '0360_team_premium_seats.sql';

commit;
