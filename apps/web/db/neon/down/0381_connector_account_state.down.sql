-- Reversal of 0381 removes the account-wide connector on/off state. Every
-- connector an account switched off on the connectors screen is on again in
-- every chat, and the saved choices are lost. Code that reads the table denies
-- every connector while it is missing, so revert that code first.

begin;

drop policy if exists connector_account_states_owner on public.connector_account_states;
drop trigger if exists set_connector_account_states_updated_at
  on public.connector_account_states;
alter table if exists public.connector_account_states disable row level security;
alter table if exists public.connector_account_states no force row level security;
drop table if exists public.connector_account_states;

delete from public.schema_migrations where filename = '0381_connector_account_state.sql';

commit;
