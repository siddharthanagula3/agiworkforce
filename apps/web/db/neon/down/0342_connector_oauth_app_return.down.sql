-- Reversal of 0342 : connector sign-ins started on the phone no longer return
-- to it.
--
-- WHAT THIS COSTS: a connector sign-in from the phone lands on the web login
-- again and never comes back to the app.

begin;

alter table public.connector_oauth_authorizations drop column if exists app_return;

delete from public.schema_migrations
 where filename = '0342_connector_oauth_app_return.sql';

commit;
