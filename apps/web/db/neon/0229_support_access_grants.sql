-- =============================================================================
-- Migration 0229: break-glass support access, and the trail it cannot leave
--                 without writing to
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : /security and /trust both said the honest thing and both said the
--          same thing: production database credentials exist, they are held by
--          the operator, and there is no just-in-time approval, no scope, no
--          expiry and no audit trail over them. Everything the application does
--          on a tenant's behalf is audited; the one path that is not audited is
--          the one with the most authority.
--
-- Shape  : A grant is REQUESTED by one operator and APPROVED by a different
--          one, for a named workspace, a named list of scopes, a stated reason
--          and a ticket, and it expires. Nothing here is a permission by
--          itself: `support_access_service.ts` refuses every support-principal
--          read that no live grant covers, and records the refusal.
--
-- Trail  : `support_access_events` is append-only twice over. The application
--          role holds no write privilege at all (0144's rule), and a trigger
--          refuses UPDATE and DELETE from ANY role including the owner, so the
--          operator who holds the production credentials cannot quietly edit
--          their own trail through them. What a direct connection can still do
--          is `alter table ... disable trigger`, which is why each row also
--          carries `previous_hash`/`entry_hash`: the chain is per workspace,
--          computed by the writer, and `verifySupportAccessTrail` recomputes it,
--          so a removed or rewritten row is detectable after the fact even by
--          someone holding nothing but a read replica.
--
--          The trail deliberately carries no foreign keys. An audit row has to
--          outlive the grant it describes and the workspace it names; a cascade
--          from `organizations` would delete exactly the evidence a deletion
--          most needs.
--
-- Read by : the workspace, not only us. Owners and admins of the named
--          workspace select their own grants and their own events, because
--          "we will tell you when we look" is worth nothing if the telling is
--          a screenshot we control. Writes belong to the service connection.
--
-- Depends: 0015 (organizations), 0037 (app_rls), 0143 (set_row_updated_at)
-- =============================================================================

begin;

create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by_user_id text not null,
  approved_by_user_id text,
  revoked_by_user_id text,
  reason text not null check (char_length(reason) between 20 and 2000),
  ticket_ref text not null check (char_length(ticket_ref) between 3 and 128),
  scopes text[] not null check (cardinality(scopes) between 1 and 32),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'revoked', 'expired')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_access_grants_approval_is_complete check (
    (status = 'approved') =
    (approved_by_user_id is not null and decided_at is not null and expires_at is not null)
  ),
  constraint support_access_grants_needs_a_second_approver check (
    approved_by_user_id is null or approved_by_user_id <> requested_by_user_id
  ),
  constraint support_access_grants_is_time_boxed check (
    expires_at is null
    or (expires_at > requested_at and expires_at <= requested_at + interval '8 hours')
  ),
  constraint support_access_grants_revocation_is_dated check (
    (status = 'revoked') = (revoked_at is not null)
  ),
  constraint support_access_grants_scopes_are_named check (
    not ('' = any (scopes))
  )
);

comment on table public.support_access_grants is
  'One time-boxed, second-approver break-glass grant over one workspace. Holding platform credentials is not access; an approved, unexpired row covering the scope is.';
comment on column public.support_access_grants.expires_at is
  'Set only at approval and capped at eight hours by check constraint, so a grant cannot be written as permanent even by a direct connection.';
comment on column public.support_access_grants.scopes is
  'The resource types this grant covers. A read outside them is refused and recorded as a refusal, the same as a read with no grant at all.';

create index if not exists idx_support_access_grants_organization
  on public.support_access_grants (organization_id, requested_at desc);

create index if not exists idx_support_access_grants_live
  on public.support_access_grants (organization_id, expires_at)
  where status = 'approved';

drop trigger if exists set_support_access_grants_updated_at on public.support_access_grants;
create trigger set_support_access_grants_updated_at
  before update on public.support_access_grants
  for each row execute function public.set_row_updated_at();

create table if not exists public.support_access_events (
  id bigserial primary key,
  grant_id uuid,
  organization_id uuid not null,
  actor_user_id text not null,
  event text not null check (
    event in ('requested', 'approved', 'denied', 'revoked', 'expired', 'accessed', 'refused')
  ),
  resource_type text check (resource_type is null or char_length(resource_type) between 1 and 128),
  resource_id text check (resource_id is null or char_length(resource_id) between 1 and 256),
  row_count integer check (row_count is null or row_count >= 0),
  detail jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 8192),
  occurred_at timestamptz not null default now(),
  previous_hash text not null check (previous_hash ~ '^[0-9a-f]{64}$'),
  entry_hash text not null unique check (entry_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.support_access_events is
  'Append-only trail of every break-glass grant transition and every read taken under one. No foreign keys: the evidence outlives the grant and the workspace it names.';
comment on column public.support_access_events.previous_hash is
  'The entry_hash of the previous event for this workspace, or 64 zeroes for the first. A deleted or rewritten row breaks the chain and verifySupportAccessTrail names where.';

create index if not exists idx_support_access_events_organization
  on public.support_access_events (organization_id, id);

create index if not exists idx_support_access_events_grant
  on public.support_access_events (grant_id, id)
  where grant_id is not null;

create or replace function public.support_access_events_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'support_access_events is append-only: % is refused. Correct the record by appending, never by rewriting.',
    tg_op;
end;
$$;

comment on function public.support_access_events_are_append_only() is
  'Refuses UPDATE and DELETE on the break-glass trail for every role, including the owner connection the operator holds.';

drop trigger if exists support_access_events_append_only on public.support_access_events;
create trigger support_access_events_append_only
  before update or delete on public.support_access_events
  for each row execute function public.support_access_events_are_append_only();

-- 0037 hands every new table full DML through ALTER DEFAULT PRIVILEGES, so the
-- grants below are a REVOKE first, exactly as 0144 had to be.
revoke insert, update, delete on public.support_access_grants from app_rls;
revoke insert, update, delete on public.support_access_events from app_rls;
revoke usage, select on sequence public.support_access_events_id_seq from app_rls;
grant select on public.support_access_grants to app_rls;
grant select on public.support_access_events to app_rls;

alter table public.support_access_grants enable row level security;
alter table public.support_access_grants force row level security;
alter table public.support_access_events enable row level security;
alter table public.support_access_events force row level security;

drop policy if exists support_access_grants_workspace_read on public.support_access_grants;
create policy support_access_grants_workspace_read
  on public.support_access_grants
  for select to app_rls
  using (
    exists (
      select 1 from public.organization_members m
       where m.organization_id = support_access_grants.organization_id
         and m.user_id = public.current_app_user_id()
         and m.role in ('owner', 'admin')
    )
  );

drop policy if exists support_access_events_workspace_read on public.support_access_events;
create policy support_access_events_workspace_read
  on public.support_access_events
  for select to app_rls
  using (
    exists (
      select 1 from public.organization_members m
       where m.organization_id = support_access_events.organization_id
         and m.user_id = public.current_app_user_id()
         and m.role in ('owner', 'admin')
    )
  );

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. One operator cannot approve their own request:
-- --    UPDATE public.support_access_grants
-- --       SET status = 'approved', approved_by_user_id = requested_by_user_id,
-- --           decided_at = now(), expires_at = now() + interval '1 hour';
-- --    EXPECT: check violation (support_access_grants_needs_a_second_approver).
--
-- -- 2. A grant cannot be written as permanent, or as longer than eight hours:
-- --    UPDATE public.support_access_grants SET expires_at = requested_at + interval '9 hours';
-- --    EXPECT: check violation (support_access_grants_is_time_boxed).
--
-- -- 3. The trail refuses to be rewritten, as the owner, not merely as app_rls:
-- --    UPDATE public.support_access_events SET event = 'approved' WHERE id = 1;
-- --    DELETE FROM public.support_access_events WHERE id = 1;
-- --    EXPECT: ERROR support_access_events is append-only for both.
--
-- -- 4. The application role holds no write privilege on either table:
-- --    SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
-- --      FROM information_schema.role_table_grants
-- --     WHERE grantee = 'app_rls'
-- --       AND table_name IN ('support_access_grants', 'support_access_events')
-- --     GROUP BY table_name;
-- --    EXPECT: SELECT for both.
--
-- -- 5. A workspace reads its own grants and nobody else's:
-- --    SET ROLE app_rls;
-- --    SELECT set_config('app.user_id', '<an owner of org A>', true);
-- --    SELECT count(*) FROM public.support_access_grants;
-- --    EXPECT: org A's rows only; 0 for a plain member.
