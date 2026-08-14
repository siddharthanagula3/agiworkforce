-- 0115 — discovery-based OAuth for MCP connectors.
--
-- WHY THIS EXISTS
-- 0097 built an OAuth broker whose provider facts (authorize endpoint, token
-- endpoint, scopes, client credentials) come from `CONNECTOR_OAUTH_PROVIDERS_JSON`
-- plus per-connector `CONNECTOR_OAUTH_<ID>_CLIENT_ID/_SECRET` env vars. That is
-- the correct design for a provider whose OAuth app the operator genuinely owns,
-- and it ships with zero providers on purpose because this repository cannot
-- prove another vendor's endpoints.
--
-- The consequence, though, is that a connector is connectable only after an
-- operator registers an OAuth application with that specific vendor. With 83
-- operator-configurable entries in lib/connectors/catalog.ts, that is 83
-- registrations before the directory stops being a wall of dead Connect buttons.
--
-- MCP's authorization spec exists precisely to remove that step. A remote MCP
-- server advertises its own authorization server (RFC 9728 protected-resource
-- metadata, reached from the `WWW-Authenticate` challenge on an unauthenticated
-- request), that authorization server advertises its own endpoints (RFC 8414),
-- and the client obtains a `client_id` WITHOUT a human pre-registering: either
-- by presenting a URL that serves its own client metadata document (CIMD), or —
-- for authorization servers that do not support CIMD — by dynamic registration.
--
-- So the endpoints and credentials this schema stores are DISCOVERED at runtime
-- rather than configured. That is the whole point: it is what lets a connector
-- work without the operator holding a relationship with the vendor.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No vendor endpoints are seeded. Nothing in this migration asserts a fact about
-- Linear, Notion, or anyone else. Every row is written from a live discovery
-- response, so a wrong or stale endpoint cannot be baked into the product.
--
-- TRUST BOUNDARY
-- `mcp_oauth_clients` is NOT user-scoped and carries no RLS policy, because a
-- client registration is a property of (this deployment, that authorization
-- server) — not of a user. Two users connecting to the same MCP server share
-- one registration, which is also what stops a popular server from being
-- dynamically registered once per user. It is written only by server-side
-- discovery code and read only through the privileged connection; no route
-- exposes it. The per-user secrets stay where 0097 put them, in
-- `connector_oauth_grants`, under that table's existing RLS policy.
--
-- Depends: 0097_connector_oauth_broker
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Client registrations, keyed by authorization-server issuer
-- ---------------------------------------------------------------------------
create table if not exists public.mcp_oauth_clients (
  -- The authorization server's `issuer` value, exactly as it published it in
  -- RFC 8414 metadata. This is the identity the whole flow is anchored to: a
  -- registration is only valid against the issuer it was made with, and the
  -- issuer is what a later refresh is checked against (SEP-2352).
  issuer text primary key,
  client_id text not null,
  -- AES-256-GCM ciphertext (lib/custom-connector-crypto.ts), matching how 0097
  -- stores every other connector secret. Null for a public client and for CIMD,
  -- where the client_id IS a URL and there is no secret to hold.
  client_secret_enc text,
  -- How the client_id was obtained:
  --   'cimd'    — client_id is an HTTPS URL serving our client metadata
  --               document; nothing was registered anywhere.
  --   'dynamic' — RFC 7591 dynamic client registration. Deprecated by the MCP
  --               client-registration guidance, kept because most deployed
  --               authorization servers do not yet advertise CIMD support.
  registration_method text not null
    check (registration_method = any (array['cimd', 'dynamic'])),
  -- Only meaningful for 'cimd'; recorded so a change of hosted document URL is
  -- visible rather than silently reusing a stale client_id.
  client_metadata_url text,
  client_id_issued_at timestamptz,
  -- RFC 7591 allows an issued client secret to expire. Null means "no expiry".
  client_secret_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A CIMD registration has no secret by construction; a row claiming otherwise
  -- would mean the discovery code took a branch it should not have.
  constraint mcp_oauth_clients_cimd_holds_no_secret
    check (registration_method <> 'cimd' or client_secret_enc is null)
);

-- ---------------------------------------------------------------------------
-- Discovered facts on the settled grant
-- ---------------------------------------------------------------------------
-- `issuer` is the SEP-2352 control. 0097 already pins `token_endpoint` on the
-- grant so an edited registry entry cannot redirect a refresh, but it could not
-- detect the case where a server legitimately MOVES to a different authorization
-- server: the stored token would simply keep being refreshed against the old
-- one until it failed. Recording the issuer the grant was minted under lets the
-- refresh path compare it to what discovery reports now and force a clean
-- re-authorization on a mismatch, rather than replaying a credential at a
-- server that is no longer the right audience for it.
alter table public.connector_oauth_grants
  add column if not exists issuer text;

-- RFC 8707 resource indicator the token was bound to. Stored so a token minted
-- for one MCP server is never presented to another.
alter table public.connector_oauth_grants
  add column if not exists resource_url text;

-- The MCP endpoint this grant authorizes. For a discovered connector this is
-- the only place the server URL is recorded, since there is no registry entry.
alter table public.connector_oauth_grants
  add column if not exists mcp_url text;

-- ---------------------------------------------------------------------------
-- Discovered facts on the in-flight authorization
-- ---------------------------------------------------------------------------
-- The callback runs in a different request than the start, and for a discovered
-- connector there is no registry to re-read the endpoints from. They are pinned
-- here at start time so the code exchange cannot be steered somewhere else by a
-- discovery response that changed in between.
alter table public.connector_oauth_authorizations
  add column if not exists issuer text;
alter table public.connector_oauth_authorizations
  add column if not exists token_endpoint text;
alter table public.connector_oauth_authorizations
  add column if not exists authorization_endpoint text;
alter table public.connector_oauth_authorizations
  add column if not exists resource_url text;
alter table public.connector_oauth_authorizations
  add column if not exists mcp_url text;
alter table public.connector_oauth_authorizations
  add column if not exists client_id text;

-- Refresh and reconnect both look a grant up by issuer to decide whether the
-- authorization server changed under it.
create index if not exists connector_oauth_grants_issuer_idx
  on public.connector_oauth_grants (issuer)
  where revoked_at is null;
