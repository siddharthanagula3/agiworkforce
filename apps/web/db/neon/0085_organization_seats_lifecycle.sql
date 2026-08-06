-- =============================================================================
-- Migration 0085: organization ownership, licensed seats, member lifecycle
--
-- Why    : Team is a real catalog/entitlement tier but cannot enter self-serve
--          checkout because three facts do not exist in the schema:
--            1. ownership  — `organizations.created_by` is a nullable, un-FK'd
--               text column nobody authorizes against; ownership is inferred by
--               scanning `organization_members.role = 'owner'`, which permits
--               BOTH zero owners (an unbillable, orphaned org) and many owners.
--            2. seats      — there is no purchased-seat number, no consumed
--               count and no ceiling. The seat check in
--               apps/web/app/api/settings/team/route.ts was dead code because
--               `TeamAdminAccess.maxMembers` was hard-coded null.
--            3. lifecycle  — there is no invitation entity at all, so a
--               colleague without an existing AGI account cannot be onboarded.
--
-- Model  : `organizations` + `organization_members` stay the ONE membership
--          system. 0058_drop_legacy_teams.sql removed `teams`/`team_members`
--          precisely because a second membership model with a forked role
--          vocabulary is unmaintainable; nothing here reintroduces that shape.
--          No `teams`, no `team_members`, no `team_invitations`, no
--          admin/editor/viewer vocabulary.
--
-- Seat   : `organizations.seats_consumed` is maintained ONLY by triggers and
-- math     bounded by a table CHECK against `licensed_seats`. Route code must
--          never name `seats_consumed` in an UPDATE. Two admins consuming the
--          last seat concurrently both run
--          `update organizations set seats_consumed = seats_consumed + 1`,
--          which takes a ROW LOCK on the single org row; the second one
--          re-evaluates the CHECK against the committed value and aborts with
--          SQLSTATE 23514, which the services map to a 409. The advisory locks
--          the routes already take are an ordering nicety — the CHECK is the
--          actual guarantee.
--
-- Ordering: a CHECK constraint is IMMEDIATE and cannot be deferred in
-- caveat    PostgreSQL. Accepting an invitation therefore MUST flip the
--           invitation out of 'pending' (releasing its seat) BEFORE inserting
--           the membership row (consuming one). The reverse order transiently
--           reaches seats_consumed + 1 and would trip the ceiling on a full
--           org. See organization-invitation-service.ts.
--
-- Fails   : every new policy resolves membership from `organization_members`
-- closed    through `app_has_org_role` (0076), never from a client claim, and
--           returns false when the row's organization_id is null.
--
-- Depends : 0015_organizations (organizations, organization_members)
--           0037_rls_user_isolation (current_app_user_id, app_rls role)
--           0054_gateway_user_scope_rls (organization_members_self_read)
--           0073_tenancy_foundation (tenancy predicates)
--           0076_enterprise_control_plane_tables (app_has_org_role,
--                                                 set_row_updated_at)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. Ownership columns and seat columns on `organizations`.
--
-- `owner_user_id` is DERIVED from `organization_members` by trigger, never
-- written by application code, so the two cannot disagree. It exists because
-- seat and entitlement lookups need organizations -> subscriptions in ONE join
-- rather than a members scan on every check.
--
-- No FK to `profiles`: Clerk user ids exist before a profile row does on some
-- paths, and a missing profile must not be able to break org bookkeeping.
--
-- `licensed_seats` / `stripe_*` / `billing_plan_tier` are the org-side billing
-- anchor. This migration CREATES them and backfills a behaviour-preserving
-- floor; the checkout/webhook builder WRITES them. Until that lands
-- `licensed_seats` can hold the line but cannot grow — a tracked gap, not a
-- silent one.
-- ---------------------------------------------------------------------------
alter table public.organizations add column if not exists owner_user_id text;
alter table public.organizations add column if not exists licensed_seats integer not null default 1;
alter table public.organizations add column if not exists seats_consumed integer not null default 0;
alter table public.organizations add column if not exists stripe_subscription_id text;
alter table public.organizations add column if not exists stripe_customer_id text;
alter table public.organizations add column if not exists billing_plan_tier text;
alter table public.organizations add column if not exists seat_billing_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- A1. Reconcile live data BEFORE the single-owner index is created.
--
-- Any org that already carries two owners (today's add-member route explicitly
-- allows an owner to mint another owner) would make the unique index fail to
-- build. Demote every owner except the earliest joined_at, tie-broken on
-- user_id so the outcome is deterministic and the migration is re-runnable.
-- ---------------------------------------------------------------------------
update public.organization_members as m
   set role = 'admin'
 where m.role = 'owner'
   and exists (
     select 1
       from public.organization_members as keeper
      where keeper.organization_id = m.organization_id
        and keeper.role = 'owner'
        and (keeper.joined_at, keeper.user_id) < (m.joined_at, m.user_id)
   );

-- Orgs with no owner at all (already possible today via account erasure)
-- are promoted from their earliest member so the deferred at-least-one-owner
-- constraint below does not reject unrelated future writes to that org.
update public.organization_members as m
   set role = 'owner'
 where m.role <> 'owner'
   and not exists (
     select 1
       from public.organization_members as existing_owner
      where existing_owner.organization_id = m.organization_id
        and existing_owner.role = 'owner'
   )
   and not exists (
     select 1
       from public.organization_members as earlier
      where earlier.organization_id = m.organization_id
        and (earlier.joined_at, earlier.user_id) < (m.joined_at, m.user_id)
   );

-- ---------------------------------------------------------------------------
-- A2. At-most-one-owner, enforced by the database.
--
-- A partial unique index is immune to concurrent promotion: two transactions
-- promoting different members to owner cannot both commit.
-- ---------------------------------------------------------------------------
create unique index if not exists idx_org_members_single_owner
  on public.organization_members (organization_id)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- A3. Backfill the derived columns from the reconciled membership rows.
-- `licensed_seats` starts at the current member count so no existing org is
-- instantly over-subscribed by its own history.
-- ---------------------------------------------------------------------------
update public.organizations as o
   set owner_user_id = (
         select m.user_id
           from public.organization_members as m
          where m.organization_id = o.id and m.role = 'owner'
          limit 1
       ),
       seats_consumed = (
         select count(*)
           from public.organization_members as m
          where m.organization_id = o.id
       ),
       licensed_seats = greatest(
         o.licensed_seats,
         (select count(*) from public.organization_members as m where m.organization_id = o.id)::integer,
         1
       );

-- ---------------------------------------------------------------------------
-- A4. Seat invariants. Added AFTER the backfill so the constraint is valid on
-- apply. `not valid` + `validate` keeps the lock window short on a live table.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_licensed_seats_positive'
  ) then
    alter table public.organizations
      add constraint organizations_licensed_seats_positive check (licensed_seats >= 1) not valid;
    alter table public.organizations validate constraint organizations_licensed_seats_positive;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'organizations_seats_consumed_non_negative'
  ) then
    alter table public.organizations
      add constraint organizations_seats_consumed_non_negative check (seats_consumed >= 0) not valid;
    alter table public.organizations validate constraint organizations_seats_consumed_non_negative;
  end if;

  -- THE CEILING. Every seat grant ultimately fails here, not in application code.
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_seats_within_license'
  ) then
    alter table public.organizations
      add constraint organizations_seats_within_license check (seats_consumed <= licensed_seats) not valid;
    alter table public.organizations validate constraint organizations_seats_within_license;
  end if;
end $$;

create unique index if not exists idx_organizations_stripe_subscription
  on public.organizations (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- B. The invitation entity.
--
-- Only the sha256 hex of a 32-byte random token is stored; the raw token is
-- returned exactly once at creation and at resend, following the precedent in
-- 0080_device_refresh_token_rotation.sql / lib/server/device-refresh-token.ts.
--
-- `role` deliberately excludes 'owner': ownership moves only through the
-- explicit transfer flow, never through an invitation link.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (
    email = lower(email)
    and char_length(email) between 3 and 320
  ),
  role text not null default 'member'
    check (role = any (array['admin', 'member', 'viewer'])),
  status text not null default 'pending'
    check (status = any (array['pending', 'accepted', 'declined', 'revoked', 'expired'])),
  token_hash text not null unique,
  invited_by_user_id text not null,
  accepted_by_user_id text,
  expires_at timestamptz not null,
  resent_at timestamptz,
  resend_count integer not null default 0 check (resend_count >= 0 and resend_count <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_accepted_has_actor
    check (status <> 'accepted' or accepted_by_user_id is not null)
);

-- One pending invitation per address per org: stops the same person consuming
-- two seats, and makes "resend" an UPDATE rather than a second row.
create unique index if not exists idx_org_invitations_pending_email
  on public.organization_invitations (organization_id, email)
  where status = 'pending';

create index if not exists idx_org_invitations_expiry
  on public.organization_invitations (expires_at)
  where status = 'pending';

create index if not exists idx_org_invitations_org_created
  on public.organization_invitations (organization_id, created_at desc);

drop trigger if exists set_org_invitations_updated_at on public.organization_invitations;
create trigger set_org_invitations_updated_at
  before update on public.organization_invitations
  for each row execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- C. Seat accounting and derived ownership, maintained by triggers only.
--
-- `security definer` so the counter still moves when the mutating statement
-- runs as the non-BYPASSRLS `app_rls` role, which has no policy permitting a
-- direct UPDATE of `organizations.seats_consumed`.
--
-- The org-existence guard matters: `on delete cascade` from `organizations`
-- fires these row triggers while the parent row is already gone, so the UPDATE
-- must be a harmless no-op rather than an error that blocks org deletion.
-- ---------------------------------------------------------------------------
create or replace function public.sync_organization_membership_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid;
  seat_delta integer := 0;
begin
  if tg_op = 'INSERT' then
    target_org := new.organization_id;
    seat_delta := 1;
  elsif tg_op = 'DELETE' then
    target_org := old.organization_id;
    seat_delta := -1;
  else
    target_org := new.organization_id;
    seat_delta := 0;
  end if;

  update public.organizations as o
     set seats_consumed = o.seats_consumed + seat_delta,
         owner_user_id = (
           select m.user_id
             from public.organization_members as m
            where m.organization_id = target_org
              and m.role = 'owner'
            limit 1
         )
   where o.id = target_org;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_org_membership_state on public.organization_members;
create trigger sync_org_membership_state
  after insert or update or delete on public.organization_members
  for each row execute function public.sync_organization_membership_state();

-- A pending invitation holds a seat. Without this, N invitations against N
-- free seats all accept and the org lands at 2N members.
create or replace function public.sync_organization_invitation_seats()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid;
  seat_delta integer := 0;
begin
  if tg_op = 'INSERT' then
    target_org := new.organization_id;
    seat_delta := case when new.status = 'pending' then 1 else 0 end;
  elsif tg_op = 'DELETE' then
    target_org := old.organization_id;
    seat_delta := case when old.status = 'pending' then -1 else 0 end;
  else
    target_org := new.organization_id;
    if old.status = 'pending' and new.status <> 'pending' then
      seat_delta := -1;
    elsif old.status <> 'pending' and new.status = 'pending' then
      seat_delta := 1;
    end if;
  end if;

  if seat_delta <> 0 then
    update public.organizations as o
       set seats_consumed = o.seats_consumed + seat_delta
     where o.id = target_org;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_org_invitation_seats on public.organization_invitations;
create trigger sync_org_invitation_seats
  after insert or update or delete on public.organization_invitations
  for each row execute function public.sync_organization_invitation_seats();

-- ---------------------------------------------------------------------------
-- D. At-LEAST-one-owner, as a DEFERRED constraint trigger.
--
-- A unique index cannot express "not zero". A DEFERRABLE INITIALLY DEFERRED
-- constraint trigger can: a legitimate ownership transfer demotes the current
-- owner and promotes the successor inside ONE transaction and is therefore
-- legal, while any transaction that would COMMIT an ownerless organization is
-- rejected.
--
-- This also closes the account-erasure orphan path without editing
-- lib/server/account-erasure.ts: a sole owner deleting their account now fails
-- loudly instead of silently leaving an unbillable, unadministrable org.
-- ---------------------------------------------------------------------------
create or replace function public.assert_organization_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid;
begin
  -- NEW is unassigned in a DELETE trigger, so the operation must be branched
  -- before either row variable is dereferenced.
  if tg_op = 'DELETE' then
    target_org := old.organization_id;
  else
    target_org := new.organization_id;
  end if;

  -- The organization itself was deleted: cascading membership removal is fine.
  if not exists (select 1 from public.organizations where id = target_org) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if not exists (
    select 1
      from public.organization_members
     where organization_id = target_org
       and role = 'owner'
  ) then
    raise exception
      'organization % would be left without an owner'
      , target_org
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- INSERT is covered too, so populating an organization with members but no
-- owner is rejected at commit as well. Legitimate org creation inserts the
-- organization and its owner in ONE transaction, so the deferred check sees the
-- owner and passes.
drop trigger if exists assert_org_has_owner on public.organization_members;
create constraint trigger assert_org_has_owner
  after insert or update or delete on public.organization_members
  deferrable initially deferred
  for each row execute function public.assert_organization_has_owner();

-- ---------------------------------------------------------------------------
-- E. RLS. Extends 0054/0073/0076 — nothing here bypasses them.
--
-- `organization_members` previously had exactly one policy
-- (organization_members_self_read from 0054), which is why an admin reading
-- the member list over `app_rls` would see only their own row. Admin read and
-- admin write are added so those routes CAN move off the BYPASSRLS owner
-- connection.
--
-- The write policy's WITH CHECK additionally refuses an owner promotion by a
-- non-owner, so an admin cannot demote-the-owner-and-promote-self inside one
-- transaction and slip past the deferred owner constraint.
-- ---------------------------------------------------------------------------
alter table public.organization_members enable row level security;
alter table public.organization_members force row level security;

drop policy if exists organization_members_admin_read on public.organization_members;
create policy organization_members_admin_read
  on public.organization_members for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists organization_members_admin_write on public.organization_members;
create policy organization_members_admin_write
  on public.organization_members for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (
    public.app_has_org_role(organization_id, array['owner', 'admin']::text[])
    and (
      role <> 'owner'
      or public.app_has_org_role(organization_id, array['owner']::text[])
    )
  );

alter table public.organization_invitations enable row level security;
alter table public.organization_invitations force row level security;

drop policy if exists organization_invitations_admin_access on public.organization_invitations;
create policy organization_invitations_admin_access
  on public.organization_invitations for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

-- The invitee has no membership row and no email claim in the JWT, so
-- acceptance CANNOT be authorized by RLS. It is authorized by presenting the
-- one-time token, which makes the accept handler the one legitimate privileged
-- path; it is bound to `token_hash = $1 and status = 'pending' and expires_at >
-- now()` and nothing else.

-- Owners and admins may update their own organization row (name, slug). Seat
-- columns are still trigger- and webhook-owned; see the seat guard below.
drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update
  on public.organizations for update to app_rls
  using (public.app_has_org_role(id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(id, array['owner', 'admin']::text[]));

grant select, insert, update, delete on public.organization_invitations to app_rls;
grant select, insert, update, delete on public.organization_members to app_rls;
grant select, update on public.organizations to app_rls;

-- ---------------------------------------------------------------------------
-- F. Seat columns are not application-writable.
--
-- A trigger-maintained counter drifts the moment one code path writes it
-- directly, and a `licensed_seats` an org admin can raise is a free upgrade.
-- Reject both at the database, except from the privileged control-plane
-- connection (the Stripe webhook) which does not run as `app_rls`.
-- ---------------------------------------------------------------------------
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

drop trigger if exists guard_organization_seats on public.organizations;
create trigger guard_organization_seats
  before update on public.organizations
  for each row execute function public.guard_organization_seat_columns();

revoke all on function public.sync_organization_membership_state() from public;
revoke all on function public.sync_organization_invitation_seats() from public;
revoke all on function public.assert_organization_has_owner() from public;
