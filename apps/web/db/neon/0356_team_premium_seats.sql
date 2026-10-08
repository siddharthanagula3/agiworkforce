-- =============================================================================
-- Migration 0356: Premium seats on a Team subscription
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
-- Assign : an active membership row may become Premium only while a paid
-- ceiling  Premium seat is free. Only active members count, so a removed
--          member never holds a paid seat. The trigger takes the organization
--          row lock before it counts, so two administrators assigning the last
--          Premium seat serialize and the second fails with SQLSTATE 23514. A
--          Premium member reactivated with no paid seat free comes back on
--          Standard rather than being refused.
--
-- Grace  : `premium_paid_through` is set when a Premium seat is moved back to
--          Standard. The period was paid for at the Premium price, so the
--          member keeps Premium entitlement until that instant and the next
--          renewal bills the Standard price. It grants entitlement, so the
--          application role cannot set it; only the privileged billing
--          connection does. `seat_type_changed_at` orders who keeps Premium,
--          so it moves only when the seat type does.
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
  where seat_type = 'premium' and status = 'active';

create or replace function public.guard_premium_seat_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  paid_premium integer;
  assigned_premium integer;
  becomes_active boolean;
begin
  becomes_active := tg_op = 'UPDATE'
    and new.status = 'active'
    and old.status is distinct from 'active';

  if tg_op = 'UPDATE'
     and new.seat_type is not distinct from old.seat_type
     and new.organization_id is not distinct from old.organization_id
     and not becomes_active then
    new.seat_type_changed_at := old.seat_type_changed_at;
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.seat_type is distinct from old.seat_type
     or new.organization_id is distinct from old.organization_id then
    new.seat_type_changed_at := now();
  else
    new.seat_type_changed_at := old.seat_type_changed_at;
  end if;

  if new.seat_type <> 'premium' or new.status <> 'active' then
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
     and m.status = 'active'
     and m.user_id <> new.user_id;

  if assigned_premium + 1 > paid_premium then
    if becomes_active and new.seat_type is not distinct from old.seat_type then
      new.seat_type := 'standard';
      new.seat_type_changed_at := now();
      return new;
    end if;
    raise exception 'organization % has no paid Premium seat left to assign', new.organization_id
      using errcode = 'check_violation',
            constraint = 'organization_members_premium_within_license';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_premium_seat_assignment on public.organization_members;
create trigger guard_premium_seat_assignment
  before insert or update on public.organization_members
  for each row execute function public.guard_premium_seat_assignment();

revoke all on function public.guard_premium_seat_assignment() from public;

create or replace function public.guard_premium_paid_through()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'app_rls'
     and new.premium_paid_through is not null
     and (tg_op = 'INSERT' or new.premium_paid_through is distinct from old.premium_paid_through) then
    raise exception 'premium_paid_through is written by billing provisioning, not by the application'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_premium_paid_through on public.organization_members;
create trigger guard_premium_paid_through
  before insert or update of premium_paid_through on public.organization_members
  for each row execute function public.guard_premium_paid_through();

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
  'standard or premium. An active premium row is refused unless a paid Premium seat is free.';
comment on column public.organization_members.premium_paid_through is
  'Set by billing provisioning when a Premium seat moves back to Standard: Premium entitlement until this instant, never past the owner subscription period end. The application role cannot set it.';

commit;
