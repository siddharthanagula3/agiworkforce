-- 0206 : workspace API keys that act for the workspace, limited to named permissions.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Personal developer keys act as one person across every workspace they belong
-- to. A compliance or SIEM integration needs the opposite: a credential owned by
-- the workspace, that keeps working after the admin who made it leaves, and that
-- can read the audit trail without being able to change policy. Each key holds a
-- subset of the permission grid (0200). The Primary Owner permissions are never
-- grantable to a key. Only the SHA-256 of the secret is stored.
--
-- Written only by the service role after the route has checked identity.manage
-- and that the creator holds every scope. Members with identity.read may list
-- keys; the hash never leaves the service.

begin;

create table if not exists public.organization_admin_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  key_prefix text not null check (key_prefix ~ '^agiadm_[A-Za-z0-9]{8}$'),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (
    cardinality(scopes) between 1 and 16
    and scopes <@ array[
      'content.read', 'content.share', 'content.govern', 'sharing.manage',
      'members.manage', 'owners.manage', 'roles.manage', 'groups.manage',
      'policy.manage', 'identity.read', 'identity.manage', 'directory.manage',
      'audit.read', 'billing.read', 'workspace.settings'
    ]::text[]
  ),
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  constraint organization_admin_api_keys_expiry_after_creation
    check (expires_at is null or expires_at > created_at)
);

create index if not exists idx_organization_admin_api_keys_org
  on public.organization_admin_api_keys (organization_id, created_at desc);

grant select (
  id, organization_id, name, key_prefix, scopes, created_by, created_at,
  expires_at, last_used_at, revoked_at, revoked_by
) on public.organization_admin_api_keys to app_rls;

alter table public.organization_admin_api_keys enable row level security;
alter table public.organization_admin_api_keys force row level security;

drop policy if exists organization_admin_api_keys_identity_read
  on public.organization_admin_api_keys;
create policy organization_admin_api_keys_identity_read
  on public.organization_admin_api_keys for select to app_rls
  using (public.app_has_org_permission(organization_id, 'identity.read'));

commit;
