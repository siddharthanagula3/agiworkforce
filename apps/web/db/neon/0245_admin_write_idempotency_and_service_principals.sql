-- =============================================================================
-- Migration 0245: admin write idempotency keys and service principals
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : two gaps in the workspace administration API, both of which lose a
--          caller's work silently.
--
--          First, every admin write is non-idempotent. A client that retries a
--          create after a timeout, a proxy that replays a request, or an
--          automation loop that runs twice gets two workspace API keys, two
--          roles, two of whatever it asked for, and no way to tell the retry
--          from a second intent. `admin_request_idempotency` stores one row per
--          (workspace, scope, key), so the second arrival replays the first
--          response instead of performing the write again. The request
--          fingerprint is stored with it: reusing a key for a different body is
--          a client bug, and it is answered with a conflict rather than with
--          the unrelated earlier response.
--
--          Second, `organization_admin_api_keys` (0206) has no identity of its
--          own. A key carries `created_by`, a human user id, so an automation's
--          actions are attributed to whichever administrator happened to mint
--          the key, and the key outlives that person's membership with the
--          permissions they held on the day they created it.
--          `organization_service_principals` is that missing identity: a named,
--          non-interactive actor owned by the workspace, which a key belongs
--          to. It can be disabled once, which stops every key issued to it,
--          and `max_scopes` bounds what any of its keys may ever carry, so a
--          key cannot be re-minted broader than the principal.
--
-- Backfill: every existing key gets a principal named after the key, carrying
--          that key's scopes, so nothing loses access on apply and every key
--          has an identity from the first read afterwards.
--
-- Expiry : idempotency rows are retained for 24 hours, long enough to cover
--          any client retry budget and short enough that a key can be reused
--          for a genuinely new intent the next day. `expires_at` is indexed so
--          the sweep is one range scan.
--
-- RLS    : neither table is written through `app_rls`. The routes resolve the
--          workspace first and write with the service connection, exactly as
--          0206 does for the keys themselves, so both tables grant select only.
--
-- Depends: 0206 (organization_admin_api_keys), 0200 (app_has_org_permission)
-- =============================================================================

begin;

create table if not exists public.organization_service_principals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  max_scopes text[] not null check (
    cardinality(max_scopes) between 1 and 16
    and max_scopes <@ array[
      'content.read', 'content.share', 'content.govern', 'sharing.manage',
      'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
      'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
      'audit.read', 'billing.read', 'workspace.settings'
    ]::text[]
  ),
  created_by_user_id text,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_by_user_id text,
  unique (organization_id, name)
);

create index if not exists idx_organization_service_principals_org
  on public.organization_service_principals (organization_id, created_at desc);

alter table public.organization_admin_api_keys
  add column if not exists service_principal_id uuid
  references public.organization_service_principals(id) on delete cascade;

-- Every key minted before this migration was scoped to the human who created
-- it. Give each one a principal of its own carrying exactly the scopes the key
-- already has, so the apply neither widens nor narrows any live automation.
do $$
declare
  key_row record;
  principal uuid;
begin
  for key_row in
    select id, organization_id, name, scopes, created_by, created_at
      from public.organization_admin_api_keys
     where service_principal_id is null
     order by created_at
  loop
    insert into public.organization_service_principals
      (organization_id, name, max_scopes, created_by_user_id, created_at)
    values (
      key_row.organization_id,
      left(key_row.name, 104) || ' (key ' || left(key_row.id::text, 8) || ')',
      key_row.scopes,
      key_row.created_by,
      key_row.created_at
    )
    on conflict (organization_id, name) do update
      set max_scopes = public.organization_service_principals.max_scopes
    returning id into principal;

    update public.organization_admin_api_keys
       set service_principal_id = principal
     where id = key_row.id;
  end loop;
end $$;

create index if not exists idx_organization_admin_api_keys_principal
  on public.organization_admin_api_keys (service_principal_id);

create table if not exists public.admin_request_idempotency (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null check (char_length(scope) between 1 and 120),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 255),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  actor_id text not null check (char_length(actor_id) between 1 and 255),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  response_status integer check (response_status is null or response_status between 100 and 599),
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (organization_id, scope, idempotency_key),
  constraint admin_request_idempotency_completed_carries_a_response
    check (status <> 'completed' or (response_status is not null and completed_at is not null))
);

create index if not exists idx_admin_request_idempotency_expires
  on public.admin_request_idempotency (expires_at);

grant select (
  id, organization_id, name, description, max_scopes, created_by_user_id,
  created_at, disabled_at, disabled_by_user_id
) on public.organization_service_principals to app_rls;

alter table public.organization_service_principals enable row level security;
alter table public.organization_service_principals force row level security;

drop policy if exists organization_service_principals_identity_read
  on public.organization_service_principals;
create policy organization_service_principals_identity_read
  on public.organization_service_principals for select to app_rls
  using (public.app_has_org_permission(organization_id, 'identity.read'));

alter table public.admin_request_idempotency enable row level security;
alter table public.admin_request_idempotency force row level security;

-- A replayed response can contain anything the original write returned,
-- including a freshly minted key, so no interactive session reads this table.
revoke all on public.admin_request_idempotency from app_rls;

comment on table public.organization_service_principals is
  'Non-interactive workspace actor. Workspace API keys belong to a principal rather than to the administrator who minted them; disabling the principal stops every key issued to it.';
comment on column public.organization_service_principals.max_scopes is
  'Upper bound on the permissions any key issued to this principal may carry. A key is issued with a subset, never more.';
comment on table public.admin_request_idempotency is
  'One row per (workspace, scope, Idempotency-Key). A repeat of a completed write replays the stored response; a repeat with a different body is a conflict.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Every pre-existing key has an identity:
-- --    SELECT count(*) FROM public.organization_admin_api_keys
-- --     WHERE service_principal_id IS NULL;  -- EXPECT: 0
--
-- -- 2. The backfilled principal carries exactly the key's scopes:
-- --    SELECT k.scopes = p.max_scopes
-- --      FROM public.organization_admin_api_keys k
-- --      JOIN public.organization_service_principals p ON p.id = k.service_principal_id;
-- --    EXPECT: every row true.
--
-- -- 3. Disabling a principal cascades to nothing and deletes nothing:
-- --    UPDATE public.organization_service_principals SET disabled_at = now()
-- --     WHERE id = '<principal>';
-- --    SELECT count(*) FROM public.organization_admin_api_keys
-- --     WHERE service_principal_id = '<principal>';  -- EXPECT: unchanged
--
-- -- 4. A completed idempotency row must carry a response:
-- --    INSERT INTO public.admin_request_idempotency
-- --      (organization_id, scope, idempotency_key, request_fingerprint, actor_id, status)
-- --    VALUES ('<org>', 'test', 'abcdefgh', repeat('a', 64), 'user_1', 'completed');
-- --    EXPECT: check violation (admin_request_idempotency_completed_carries_a_response).
--
-- -- 5. An interactive session cannot read a replayed response:
-- --    SET ROLE app_rls;
-- --    SELECT * FROM public.admin_request_idempotency;  -- EXPECT: permission denied
