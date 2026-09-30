-- =============================================================================
-- Migration 0343: let a GitHub app install started on the phone finish on it
--
-- Why    : the phone opens the GitHub App install in its own browser session,
--          which has no web cookie session. Every hop of the install (start,
--          setup callback, user authorization callback) required one, so the
--          reader landed on the web login and the install never linked.
--
-- Shape  : github_install_authorizations holds one in-flight install the app
--          started with its signed-in API session. It stores only SHA-256
--          hashes of the two state values. The setup callback may record the
--          installation id against a pending row and nothing more; the user
--          authorization response is handed back to the app, and only the
--          account that started the install can finish it, after GitHub
--          confirms the installation is reachable by the authorizing user. A
--          link handed to someone else therefore cannot attach their
--          installation to the starter's account. The user authorization leg
--          uses PKCE: each row holds its own code_verifier, AES-256-GCM sealed
--          like the connector broker's (0097), so a code intercepted on its way
--          back to the app can only be exchanged with the verifier of the row it
--          was minted for. Rows are single-use (consumed_at) and expire.
--
-- Depends: 0037_rls_user_isolation (current_app_user_id, app_rls role)
-- =============================================================================

begin;

create table if not exists public.github_install_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  install_state_hash text not null check (install_state_hash ~ '^[0-9a-f]{64}$'),
  oauth_state_hash text check (oauth_state_hash ~ '^[0-9a-f]{64}$'),
  installation_id bigint check (installation_id > 0),
  code_verifier_enc text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint github_install_authorizations_install_state_unique unique (install_state_hash),
  constraint github_install_authorizations_oauth_state_unique unique (oauth_state_hash),
  constraint github_install_authorizations_oauth_needs_installation
    check (oauth_state_hash is null or installation_id is not null),
  constraint github_install_authorizations_oauth_needs_verifier
    check (oauth_state_hash is null or code_verifier_enc is not null)
);

create index if not exists idx_github_install_authorizations_user
  on public.github_install_authorizations(user_id);
create index if not exists idx_github_install_authorizations_expiry
  on public.github_install_authorizations(expires_at);

alter table public.github_install_authorizations enable row level security;
alter table public.github_install_authorizations force row level security;
drop policy if exists github_install_authorizations_user_isolation
  on public.github_install_authorizations;
create policy github_install_authorizations_user_isolation
  on public.github_install_authorizations for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

commit;
