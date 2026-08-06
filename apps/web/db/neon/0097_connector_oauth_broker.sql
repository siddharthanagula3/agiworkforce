-- =============================================================================
-- Migration 0097: per-user connector OAuth broker (authorization-code + PKCE)
--
-- Why    : Managed Cloud had NO per-user OAuth anywhere in the connector path.
--          `user_connectors` (0048) is an enablement gate with no credentials,
--          `user_custom_connectors` (0052) stores a bearer token the USER typed
--          in, and the operator map (`CONNECTOR_MCP_SERVERS_JSON`) is a static
--          endpoint with static operator headers. None of those can express
--          "the platform runs its own OAuth app, the user clicks Connect, and
--          we hold that user's tokens" — so every directory provider correctly
--          reported "Coming soon". These two tables are the missing state.
--
-- Model  : Two tables, both PERSONAL scope (user_id only, no organization_id).
--          An OAuth grant is a consent a natural person gave to a provider on
--          their own account; unlike the content tables in 0073 it is never
--          workspace-owned, and an org admin must not inherit a member's
--          Google/Slack tokens by switching workspace. The RLS shape therefore
--          matches 0069_connector_tool_permissions_rls.sql and
--          0052_user_custom_connectors.sql (plain `current_app_user_id()`
--          isolation), NOT 0073's `app_row_is_visible()` tenancy predicate.
--
--          `connector_oauth_authorizations` is the in-flight leg: one row per
--          started authorization, holding the PKCE verifier server-side (never
--          in a cookie) and the SHA-256 of the state, never the state itself,
--          so a database read cannot replay a live flow. Single-use is a
--          conditional UPDATE on `consumed_at`, expiry is a column.
--
--          `connector_oauth_grants` is the settled leg: one live grant per
--          (user, connector). Access/refresh tokens are AES-256-GCM ciphertext
--          produced by lib/custom-connector-crypto.ts — the same envelope the
--          user-supplied custom-connector bearer already uses, under the
--          `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` key.
--
-- Fails  : Revocation is not a delete. `revoked_at` is set AND both ciphertext
-- closed   columns are nulled in the same statement, enforced by
--          `connector_oauth_grants_revoked_holds_no_secret`, so a revoked grant
--          physically cannot hand a token back. The mirror constraint
--          `connector_oauth_grants_live_has_token` refuses a live row with no
--          access token, so "connected" can never mean "no usable credential".
--
-- Depends: 0037_rls_user_isolation (current_app_user_id, app_rls role + grants)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- In-flight authorizations (authorization-code + PKCE, RFC 6749 / RFC 7636)
-- ---------------------------------------------------------------------------
create table if not exists public.connector_oauth_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  connector_id text not null,
  -- SHA-256 of the state parameter. The state itself only ever exists in the
  -- authorize URL and the callback query, so leaking this table leaks nothing
  -- that can complete a flow.
  state_hash text not null check (state_hash ~ '^[0-9a-f]{64}$'),
  -- AES-256-GCM ciphertext of the PKCE code_verifier. Server-side only; it is
  -- deliberately NOT a cookie, readable or otherwise.
  code_verifier_enc text not null,
  code_challenge_method text not null default 'S256'
    check (code_challenge_method = any (array['S256', 'plain'])),
  -- The exact redirect_uri sent to the authorization server, replayed verbatim
  -- at the token endpoint (RFC 6749 §4.1.3 requires the values to match).
  redirect_uri text not null,
  requested_scopes text[] not null default '{}',
  -- Same-origin path the callback returns the browser to. Validated in the app
  -- layer to be a single-slash relative path so it cannot become an open
  -- redirect; stored so a multi-surface callback can honour it.
  return_path text not null default '/connectors'
    check (return_path ~ '^/[^/\\]'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint connector_oauth_authorizations_state_unique unique (state_hash)
);

create index if not exists idx_connector_oauth_authorizations_user
  on public.connector_oauth_authorizations(user_id);
create index if not exists idx_connector_oauth_authorizations_expiry
  on public.connector_oauth_authorizations(expires_at);

alter table public.connector_oauth_authorizations enable row level security;
alter table public.connector_oauth_authorizations force row level security;
drop policy if exists connector_oauth_authorizations_user_isolation
  on public.connector_oauth_authorizations;
create policy connector_oauth_authorizations_user_isolation
  on public.connector_oauth_authorizations for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- Settled grants (one live grant per user + connector)
-- ---------------------------------------------------------------------------
create table if not exists public.connector_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  connector_id text not null,
  -- AES-256-GCM ciphertext (lib/custom-connector-crypto.ts). Null ONLY on a
  -- revoked row — see connector_oauth_grants_revoked_holds_no_secret.
  access_token_enc text,
  refresh_token_enc text,
  token_type text not null default 'Bearer',
  -- Scopes the authorization server actually GRANTED (from the token
  -- response), not the scopes we asked for. The difference is what makes a
  -- step-up / insufficient_scope decision honest.
  granted_scopes text[] not null default '{}',
  -- Null means the provider issued a token with no expiry; the app then never
  -- pre-emptively refreshes and relies on the 401 path instead.
  access_token_expires_at timestamptz,
  -- Token endpoint the grant was issued by, captured so a later refresh cannot
  -- be pointed somewhere else by an edited registry entry without detection.
  token_endpoint text not null,
  connected_at timestamptz not null default now(),
  refreshed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connector_oauth_grants_unique unique (user_id, connector_id),
  constraint connector_oauth_grants_revoked_holds_no_secret
    check (revoked_at is null or (access_token_enc is null and refresh_token_enc is null)),
  constraint connector_oauth_grants_live_has_token
    check (revoked_at is not null or access_token_enc is not null)
);

create index if not exists idx_connector_oauth_grants_user
  on public.connector_oauth_grants(user_id)
  where revoked_at is null;

alter table public.connector_oauth_grants enable row level security;
alter table public.connector_oauth_grants force row level security;
drop policy if exists connector_oauth_grants_user_isolation
  on public.connector_oauth_grants;
create policy connector_oauth_grants_user_isolation
  on public.connector_oauth_grants for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
