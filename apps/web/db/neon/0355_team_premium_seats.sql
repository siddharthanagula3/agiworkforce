-- =============================================================================
-- Migration 0355: Premium seats on a Team subscription
--
-- Why    : A Team subscription now bills two seat types on one subscription, a
--          Standard seat and a Premium seat. The schema knew one number,
--          `organizations.licensed_seats`, and nothing about which member
--          holds which kind of seat.
--
-- Model  : `licensed_seats` stays the total the subscription pays for, so the
--          seat ceiling from 0085 is untouched. `licensed_premium_seats` is how
--          many of those are Premium. A member's seat type is a column on the
--          membership row; an unassigned seat is Standard.
--
-- Paid   : `licensed_premium_seats` is written by billing provisioning only,
-- count    exactly like `licensed_seats`. The seat guard is redefined here to
--          refuse an application write to it.
--
-- Assign : a membership row may become Premium only while a paid Premium seat
-- ceiling  is free. The trigger takes the organization row lock before it
--          counts, so two administrators assigning the last Premium seat
--          serialize and the second one fails with SQLSTATE 23514.
--
-- Grace  : `premium_paid_through` is set when a Premium seat is moved back to
--          Standard. The period was paid for at the Premium price, so the
--          member keeps Premium entitlement until that instant and the next
--          renewal bills the Standard price.
--
-- Depends: 0015_organizations (organizations, organization_members)
--          0085_organization_seats_lifecycle (licensed_seats, the seat guard)
-- =============================================================================

begin;

alter table public.organizations
  add column if not exists licensed_premium_seats integer not null default 0;

alter table public.organization_members
  add column if not exists seat_type text not null default 'standard';

alter table public.organization_members
  add column if not exists seat_type_changed_at timestamptz;

alter table public.organization_members
  add column if not exists premium_paid_through timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_licensed_premium_seats_non_negative'
  ) then
    alter table public.organizations
      add constraint organizations_licensed_premium_seats_non_negative
      check (licensed_premium_seats >= 0) not valid;
    alter table public.organizations
      validate constraint organizations_licensed_premium_seats_non_negative;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'organization_members_seat_type_known'
  ) then
    alter table public.organization_members
      add constraint organization_members_seat_type_known
      check (seat_type = any (array['standard', 'premium'])) not valid;
    alter table public.organization_members
      validate constraint organization_members_seat_type_known;
  end if;
end $$;

create index if not exists idx_org_members_premium_seats
  on public.organization_members (organization_id, seat_type_changed_at, user_id)
  where seat_type = 'premium';

create or replace function public.guard_premium_seat_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  paid_premium integer;
  assigned_premium integer;
begin
  if tg_op = 'UPDATE'
     and new.seat_type is not distinct from old.seat_type
     and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;

  new.seat_type_changed_at := now();

  if new.seat_type <> 'premium' then
    return new;
  end if;

  select o.licensed_premium_seats
    into paid_premium
    from public.organizations as o
   where o.id = new.organization_id
     for update;

  if not found then
    return new;
  end if;

  select count(*)
    into assigned_premium
    from public.organization_members as m
   where m.organization_id = new.organization_id
     and m.seat_type = 'premium'
     and m.user_id <> new.user_id;

  if assigned_premium + 1 > paid_premium then
    raise exception 'organization % has no paid Premium seat left to assign', new.organization_id
      using errcode = 'check_violation',
            constraint = 'organization_members_premium_within_license';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_premium_seat_assignment on public.organization_members;
create trigger guard_premium_seat_assignment
  before insert or update of seat_type, organization_id on public.organization_members
  for each row execute function public.guard_premium_seat_assignment();

revoke all on function public.guard_premium_seat_assignment() from public;

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
    if new.licensed_premium_seats is distinct from old.licensed_premium_seats then
      raise exception 'licensed_premium_seats is written by billing provisioning, not by the application'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

comment on column public.organizations.licensed_premium_seats is
  'How many of licensed_seats the Team subscription bills at the Premium seat price. Written by billing provisioning only.';
comment on column public.organization_members.seat_type is
  'standard or premium. A premium row is refused unless a paid Premium seat is free.';
comment on column public.organization_members.premium_paid_through is
  'Set when a Premium seat moves back to Standard: the member keeps Premium entitlement until this instant, which the team already paid for.';

commit;
