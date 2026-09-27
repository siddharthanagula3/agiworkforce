-- =============================================================================
-- Migration 0313: a custom connector can sign in with OAuth
--
-- Why    : a custom connector could only send a fixed access token, so a
--          remote MCP server that asks the user to sign in was refused. The
--          connector now signs in the way a directory server does, through
--          the server's own authorization server, and may carry the OAuth
--          client the user registered there when that server takes no
--          client metadata document and no dynamic registration.
--
-- Shape  : sign_in_required marks a row whose server answered the add probe
--          with an authorization challenge or publishes protected resource
--          metadata, so the product asks the user to connect it.
--          oauth_client_id is the client the user supplied; the secret is
--          sealed with the connector key under the oauth-client-secret
--          purpose, the same class as mcp_oauth_clients.client_secret_enc.
--          The grant itself lives in connector_oauth_grants under the row's
--          custom-<short_id> connector id, like every other OAuth connector.
--
-- Depends: 0052 (user_custom_connectors)
-- =============================================================================

begin;

alter table public.user_custom_connectors
  add column if not exists sign_in_required boolean not null default false,
  add column if not exists oauth_client_id text,
  add column if not exists oauth_client_secret_enc text;

alter table public.user_custom_connectors
  drop constraint if exists user_custom_connectors_oauth_client_check,
  add constraint user_custom_connectors_oauth_client_check
    check (
      (oauth_client_id is null and oauth_client_secret_enc is null)
      or (oauth_client_id is not null and length(oauth_client_id) between 1 and 512)
    );

commit;
