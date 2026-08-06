-- 0084_scim_provisioning.sql
--
-- SCIM 2.0 service-provider runtime for enterprise directory sync.
--
-- Migration 0076 shipped `directory_sync_connections` as CONFIGURATION ONLY:
-- a provider name and a directory id, with no credential, no provisioned
-- resource, and no write path into `organization_members`. The Enterprise
-- page sells "user and group provisioning from your IdP", so this migration
-- adds the runtime state that claim requires:
--
--   scim_tokens             bearer credentials an IdP presents (hash-only)
--   scim_provisioned_users  the SCIM /Users resource, linked to profiles
--   scim_groups             the SCIM /Groups resource + org role mapping
--   scim_group_members      group membership edges
--   directory_sync_events   what the IdP actually did (append-only audit)
--
-- `directory_sync_events` already had a TypeScript row type in
-- apps/web/lib/server/neon-types.ts with no table behind it. This creates the
-- table that type always described.
--
-- TRUST BOUNDARY. SCIM requests carry no app user, so `current_app_user_id()`
-- and `app_has_org_role()` cannot authorize them: the SCIM routes run on the
-- owner connection and enforce tenancy in the application by carrying an
-- explicit `connection_id`/`organization_id` predicate on every statement.
-- The RLS policies below therefore exist for the ADMIN surface (app_rls),
-- which is a normal signed-in owner/admin, and are deliberately identical in
-- shape to `directory_sync_connections_admin_access` in 0076.
--
-- NOTE: 0076 is applied and is never edited. Everything here is additive.

-- ---------------------------------------------------------------------------
-- scim_tokens — IdP bearer credentials
-- ---------------------------------------------------------------------------
-- Only the Argon2id hash is stored. `token_prefix` is the public, indexable
-- id segment embedded in the raw token (`scim_<prefix>_<secret>`) so a
-- presented token resolves in ONE indexed lookup and exactly one Argon2
-- verification, mirroring api_keys/key_prefix in 0005.
--
-- `created_by_user_id` is the ENTITLEMENT SUBJECT. Subscriptions are per-user
-- (0003_subscriptions.sql, unique(user_id)) and there is no org-level plan, so
-- a machine SCIM request has no natural billing subject. Persisting the
-- issuing admin lets every request re-evaluate
-- canUseBillingPlanCapability(plan, 'enterprise_controls') against a real row
-- and fail closed the moment that subscription lapses.
create table if not exists public.scim_tokens (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null
    references public.directory_sync_connections(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  token_prefix text not null unique check (token_prefix ~ '^[0-9a-f]{16}$'),
  token_hash text not null,
  created_by_user_id text not null,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scim_tokens_connection_created
  on public.scim_tokens (connection_id, created_at desc);
create index if not exists idx_scim_tokens_org_created
  on public.scim_tokens (organization_id, created_at desc);

drop trigger if exists set_scim_tokens_updated_at on public.scim_tokens;
create trigger set_scim_tokens_updated_at
  before update on public.scim_tokens
  for each row execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- scim_provisioned_users — the SCIM /Users resource
-- ---------------------------------------------------------------------------
-- This product cannot mint identities from a SCIM POST: there is no Clerk
-- user-creation call anywhere, no invitation table, and `profiles` rows are
-- created lazily on first authenticated request. So a provisioned SCIM user is
-- a first-class resource that exists independently of an AGI account and links
-- to one (`linked_user_id` -> profiles.id) when an account with a matching
-- email exists. Until then the row is PENDING: the IdP sees a real, addressable
-- SCIM resource, and no membership is granted.
--
-- Deprovisioning does not depend on linkage state for its security value: an
-- `active: false` PATCH or a DELETE removes the organization_members row
-- whenever one exists.
create table if not exists public.scim_provisioned_users (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null
    references public.directory_sync_connections(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text check (external_id is null or char_length(external_id) between 1 and 255),
  user_name text not null check (char_length(user_name) between 1 and 320),
  email text check (email is null or char_length(email) <= 320),
  given_name text check (given_name is null or char_length(given_name) <= 255),
  family_name text check (family_name is null or char_length(family_name) <= 255),
  display_name text check (display_name is null or char_length(display_name) <= 255),
  active boolean not null default true,
  linked_user_id text,
  linked_at timestamptz,
  raw_attributes jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- userName is the SCIM natural key. Okta/Entra probe `userName eq "x"` before
-- every create, so this must be unique per connection and case-insensitive.
create unique index if not exists idx_scim_users_connection_username
  on public.scim_provisioned_users (connection_id, lower(user_name));
create unique index if not exists idx_scim_users_connection_external_id
  on public.scim_provisioned_users (connection_id, external_id)
  where external_id is not null;
create index if not exists idx_scim_users_org_created
  on public.scim_provisioned_users (organization_id, created_at desc);
create index if not exists idx_scim_users_linked_user
  on public.scim_provisioned_users (linked_user_id)
  where linked_user_id is not null;
create index if not exists idx_scim_users_pending_email
  on public.scim_provisioned_users (lower(email))
  where linked_user_id is null and email is not null;

drop trigger if exists set_scim_provisioned_users_updated_at
  on public.scim_provisioned_users;
create trigger set_scim_provisioned_users_updated_at
  before update on public.scim_provisioned_users
  for each row execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- scim_groups — the SCIM /Groups resource, with org role mapping
-- ---------------------------------------------------------------------------
-- `mapped_role` deliberately CANNOT be 'owner'. An IdP group must never be
-- able to mint an organization owner: /api/settings/team already refuses to
-- let an admin create an owner, and a misconfigured group rule would otherwise
-- be an unrecoverable privilege escalation.
create table if not exists public.scim_groups (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null
    references public.directory_sync_connections(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text check (external_id is null or char_length(external_id) between 1 and 255),
  display_name text not null check (char_length(display_name) between 1 and 255),
  mapped_role text check (mapped_role is null or mapped_role in ('admin', 'member', 'viewer')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_scim_groups_connection_display_name
  on public.scim_groups (connection_id, lower(display_name));
create unique index if not exists idx_scim_groups_connection_external_id
  on public.scim_groups (connection_id, external_id)
  where external_id is not null;
create index if not exists idx_scim_groups_org_created
  on public.scim_groups (organization_id, created_at desc);

drop trigger if exists set_scim_groups_updated_at on public.scim_groups;
create trigger set_scim_groups_updated_at
  before update on public.scim_groups
  for each row execute function public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- scim_group_members — group membership edges
-- ---------------------------------------------------------------------------
-- organization_id is denormalized so every policy and every application
-- predicate can name the tenant without a join.
create table if not exists public.scim_group_members (
  group_id uuid not null references public.scim_groups(id) on delete cascade,
  scim_user_id uuid not null references public.scim_provisioned_users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, scim_user_id)
);

create index if not exists idx_scim_group_members_user
  on public.scim_group_members (scim_user_id);
create index if not exists idx_scim_group_members_org
  on public.scim_group_members (organization_id);

-- ---------------------------------------------------------------------------
-- directory_sync_events — append-only record of what the IdP did
-- ---------------------------------------------------------------------------
-- Column set matches the pre-existing `DirectorySyncEventRow` type in
-- apps/web/lib/server/neon-types.ts, which described a table that did not
-- exist until now.
create table if not exists public.directory_sync_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null
    references public.directory_sync_connections(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 120),
  user_email text check (user_email is null or char_length(user_email) <= 320),
  raw_payload jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_directory_sync_events_connection_created
  on public.directory_sync_events (connection_id, created_at desc);
create index if not exists idx_directory_sync_events_org_created
  on public.directory_sync_events (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Grants + RLS for the ADMIN surface (app_rls), mirroring 0076:208-238
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.scim_tokens,
  public.scim_provisioned_users,
  public.scim_groups,
  public.scim_group_members
to app_rls;

-- Read-only at the GRANT level as well as the policy level: the record of what
-- an IdP did must not be rewritable by the org it describes.
grant select on public.directory_sync_events to app_rls;

alter table public.scim_tokens enable row level security;
alter table public.scim_tokens force row level security;
drop policy if exists scim_tokens_admin_access on public.scim_tokens;
create policy scim_tokens_admin_access
  on public.scim_tokens for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

alter table public.scim_provisioned_users enable row level security;
alter table public.scim_provisioned_users force row level security;
drop policy if exists scim_provisioned_users_admin_access on public.scim_provisioned_users;
create policy scim_provisioned_users_admin_access
  on public.scim_provisioned_users for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

alter table public.scim_groups enable row level security;
alter table public.scim_groups force row level security;
drop policy if exists scim_groups_admin_access on public.scim_groups;
create policy scim_groups_admin_access
  on public.scim_groups for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

alter table public.scim_group_members enable row level security;
alter table public.scim_group_members force row level security;
drop policy if exists scim_group_members_admin_access on public.scim_group_members;
create policy scim_group_members_admin_access
  on public.scim_group_members for all to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]))
  with check (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

-- Sync events are append-only from the admin surface's point of view: an org
-- admin may read them and may never rewrite or delete the record of what their
-- IdP did. Only the service connection (which bypasses RLS) writes rows.
alter table public.directory_sync_events enable row level security;
alter table public.directory_sync_events force row level security;
drop policy if exists directory_sync_events_admin_read on public.directory_sync_events;
create policy directory_sync_events_admin_read
  on public.directory_sync_events for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));
