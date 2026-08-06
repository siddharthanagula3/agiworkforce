-- Make enterprise SSO connections executable instead of inert bookkeeping.
--
-- Migration 0076 created public.sso_connections as a configuration record with
-- no link to an identity provider and no way to prove the configuring
-- organization owns the email domain it claims. Both are load-bearing:
--
--   1. Clerk enterprise connections are the actual SAML/OIDC implementation.
--      Without a stored connection reference the local row can never be
--      reconciled with Clerk, and the Service Provider values an IdP requires
--      (ACS URL, SP entity ID, SP metadata URL) can never be shown to the
--      admin who has to paste them into Okta / Entra ID / Google Workspace.
--
--   2. This deployment does not use Clerk Organizations, so enterprise
--      connections are created instance-level and route EVERY sign-in whose
--      email domain matches. An unverified domain claim is therefore an
--      authentication-takeover vector, not a data-quality problem. Domain
--      ownership must be proven by DNS TXT before a connection can go live.
--
-- 0076 is applied and is never edited. This migration only adds columns,
-- constraints and indexes.

alter table public.sso_connections
  add column if not exists clerk_connection_id text,
  add column if not exists oidc_discovery_url text,
  add column if not exists oidc_client_id text,
  add column if not exists acs_url text,
  add column if not exists sp_entity_id text,
  add column if not exists sp_metadata_url text,
  add column if not exists domain_verified_at timestamptz,
  add column if not exists domain_verification_token text;

-- An OIDC client secret is deliberately absent. The secret is forwarded to
-- Clerk on create/update and never persisted here, so there is no local
-- ciphertext to rotate, leak, or mis-scope.
comment on column public.sso_connections.oidc_client_id is
  'OIDC client id. The matching client secret is forwarded to Clerk and never stored locally.';
comment on column public.sso_connections.clerk_connection_id is
  'Clerk enterprise connection id. Null until the connection has been provisioned with the IdP.';

-- A connection is provisioned exactly once in Clerk; two local rows pointing at
-- the same Clerk connection would let one org deactivate another org's IdP.
create unique index if not exists idx_sso_connections_clerk_connection_id
  on public.sso_connections (clerk_connection_id)
  where clerk_connection_id is not null;

create index if not exists idx_sso_connections_org_active
  on public.sso_connections (organization_id, is_active);

-- New connections start dormant. Activation is an explicit, separately
-- authorized step that runs only after domain verification and provisioning.
alter table public.sso_connections
  alter column is_active set default false;

-- Fail closed at the storage layer as well as in the route: a row cannot be
-- active unless its domain was verified and it was actually provisioned with
-- Clerk. NOT VALID so the constraint governs every insert and update from here
-- on without failing the migration on any pre-existing row written by the old
-- write-only route; those rows are dormant configuration and are re-verified
-- through the normal flow before they can be activated.
alter table public.sso_connections
  drop constraint if exists sso_connections_active_requires_verified_provisioned;
alter table public.sso_connections
  add constraint sso_connections_active_requires_verified_provisioned
  check (
    is_active = false
    or (domain_verified_at is not null and clerk_connection_id is not null)
  )
  not valid;

-- The verification token is a high-entropy secret published in DNS; bound it so
-- a malformed or absurd value cannot be stored.
alter table public.sso_connections
  drop constraint if exists sso_connections_domain_verification_token_shape;
alter table public.sso_connections
  add constraint sso_connections_domain_verification_token_shape
  check (
    domain_verification_token is null
    or domain_verification_token ~ '^[a-f0-9]{32,64}$'
  )
  not valid;

-- Only an https metadata/discovery URL is ever forwarded to Clerk; reject
-- anything else before it reaches the outbound fetch.
alter table public.sso_connections
  drop constraint if exists sso_connections_https_endpoints;
alter table public.sso_connections
  add constraint sso_connections_https_endpoints
  check (
    (metadata_url is null or metadata_url like 'https://%')
    and (oidc_discovery_url is null or oidc_discovery_url like 'https://%')
  )
  not valid;
