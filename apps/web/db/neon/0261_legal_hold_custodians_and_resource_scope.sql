-- =============================================================================
-- Migration 0261: legal holds gain custodians and a resource-type scope
--
-- Why    : 0138 gave a hold exactly two shapes, the whole workspace or one
--          member, and no way to say which kind of content it preserves. A real
--          matter names a set of people and a set of stores ("the five people on
--          the deal, conversations and files only"). Expressed with 0138's
--          vocabulary that is five separate member holds, each of which
--          over-preserves every other store, and releasing the matter means
--          releasing five holds one at a time and hoping none is missed.
--
-- Shape  : two additions, both additive and both defaulting to today's
--          behaviour.
--
--          1. scope gains 'custodian': the hold names a list of people in
--             legal_hold_custodians rather than one subject_user_id. The
--             existing 'organization' and 'member' scopes are untouched, so
--             every existing row keeps its meaning.
--
--          2. resource_types: NULL means every store, which is what a 0138 hold
--             meant and therefore what every existing row keeps. A non-null
--             array narrows the hold to those stores, and the sweep for a store
--             outside the list is no longer suspended by it.
--
-- Safety : the widening is one-directional. A NULL resource_types cannot
--          preserve less than before, and a custodian list cannot be empty for
--          a custodian-scoped hold, because a hold holding nobody reads as a
--          hold while preserving nothing. The sweep still fails closed when the
--          hold set cannot be read; that rule lives in retention-service.ts.
--
-- Depends: 0138_retention_enforcement_and_legal_hold (legal_holds)
--          0073_tenancy_foundation                   (organizations)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The vocabulary of stores a hold can name.
--
-- One list, shared with the eDiscovery export so a hold and the export of what
-- it holds cannot disagree about what a "file" is. A CHECK rather than an enum
-- type: adding a store is then one more migration of this shape, not a type
-- rewrite that every dependent view has to be dropped for.
-- ---------------------------------------------------------------------------
alter table public.legal_holds
  add column if not exists resource_types text[];

comment on column public.legal_holds.resource_types is
  'NULL preserves every store, which is what a hold placed before 0261 meant. A non-null array narrows the hold to those stores; a sweep of a store outside the list is not suspended by this hold.';

alter table public.legal_holds
  drop constraint if exists legal_holds_resource_types_known;
alter table public.legal_holds
  add constraint legal_holds_resource_types_known check (
    resource_types is null
    or (
      array_length(resource_types, 1) > 0
      and resource_types <@ array['conversation', 'message', 'project', 'project_file',
                                  'file', 'artifact', 'work_run']::text[]
    )
  );

-- ---------------------------------------------------------------------------
-- 2. scope gains 'custodian'.
--
-- The subject constraint is replaced rather than extended: a custodian-scoped
-- hold carries no subject_user_id, its people live in the child table, and the
-- old constraint would have rejected the row outright.
-- ---------------------------------------------------------------------------
alter table public.legal_holds
  drop constraint if exists legal_holds_scope_check;
alter table public.legal_holds
  add constraint legal_holds_scope_check
  check (scope in ('organization', 'member', 'custodian'));

alter table public.legal_holds
  drop constraint if exists legal_holds_subject_matches_scope;
alter table public.legal_holds
  add constraint legal_holds_subject_matches_scope check (
    (scope = 'member' and subject_user_id is not null)
    or (scope in ('organization', 'custodian') and subject_user_id is null)
  );

-- ---------------------------------------------------------------------------
-- 3. Custodians.
--
-- One row per held person per hold. The same person may be a custodian of two
-- matters at once, which is why this is not the partial unique index 0138 put
-- on member-scoped subjects: two matters holding one person is normal, and
-- releasing one must not release the other.
-- ---------------------------------------------------------------------------
create table if not exists public.legal_hold_custodians (
  hold_id uuid not null references public.legal_holds(id) on delete cascade,
  user_id text not null,
  added_by_user_id text not null,
  created_at timestamptz not null default now(),
  primary key (hold_id, user_id)
);

create index if not exists idx_legal_hold_custodians_user
  on public.legal_hold_custodians (user_id);

comment on table public.legal_hold_custodians is
  'The people a custodian-scoped legal hold preserves. Read by the retention sweep and by the eDiscovery export; written only through the privileged connection, like legal_holds itself.';

-- ---------------------------------------------------------------------------
-- Grants and RLS, mirroring legal_holds in 0138.
--
-- Readable by owners and admins of the organization that owns the parent hold,
-- never writable from the application role: a custodian list the held
-- organization can edit is not a hold.
-- ---------------------------------------------------------------------------
-- 0037 hands every new table full DML through ALTER DEFAULT PRIVILEGES, so the
-- REVOKE comes first, exactly as 0229 had to.
revoke insert, update, delete on public.legal_hold_custodians from app_rls;
grant select on public.legal_hold_custodians to app_rls;

alter table public.legal_hold_custodians enable row level security;
alter table public.legal_hold_custodians force row level security;
drop policy if exists legal_hold_custodians_admin_read on public.legal_hold_custodians;
create policy legal_hold_custodians_admin_read
  on public.legal_hold_custodians
  for select to app_rls
  using (
    exists (
      select 1
        from public.legal_holds h
        join public.organization_members m
          on m.organization_id = h.organization_id
       where h.id = legal_hold_custodians.hold_id
         and m.user_id = public.current_app_user_id()
         and m.role in ('owner', 'admin')
    )
  );

commit;
