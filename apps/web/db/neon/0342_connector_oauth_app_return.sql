-- =============================================================================
-- Migration 0342: let a connector sign-in started on the phone return to it
--
-- Why    : the phone opens a connector's sign-in in its own browser session,
--          which has no web cookie session. The callback required one, so it
--          sent the reader to the web login and the connection never finished
--          or came back to the app.
--
-- Shape  : connector_oauth_authorizations gains app_return. For a flow the app
--          started, the callback hands the authorization response back to the
--          app instead of finishing it, and the app finishes it over its own
--          signed-in API session. The account that started the flow must be the
--          one finishing it, so a sign-in link handed to someone else cannot
--          attach their provider account to the starter's account.
-- =============================================================================

begin;

alter table public.connector_oauth_authorizations
  add column if not exists app_return boolean not null default false;

commit;
