-- =============================================================================
-- Migration 0381: an account-wide on/off state per connector
--
-- Why    : The connectors screen offers a switch per connector, as the leaders
--          do. Until now a connector could be switched off only for one
--          conversation (the composer's per-chat opt-out), and the saved tool
--          verdicts could not stand in for it: a per-tool allow outranks a
--          blocked category, so blocking both categories still let an allowed
--          tool run.
--
-- Shape  : connector_account_states holds one row per account and connector the
--          account holder has set, written through app_rls under an owner-only
--          policy. A connector with no row is on. The server reads the rows
--          with the account's saved tool verdicts and denies every tool of a
--          connector whose row says off, whatever the per-tool verdicts say; a
--          failure to read them denies every connector.
--
-- Depends: 0037 (current_app_user_id, app_rls), 0076 (set_row_updated_at)
-- =============================================================================

begin;

create table if not exists public.connector_account_states (
  user_id text not null references public.profiles(id) on delete cascade,
  connector_id text not null check (char_length(connector_id) between 1 and 200),
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, connector_id)
);

comment on table public.connector_account_states is
  'Account-wide on/off per connector. Off denies every tool of the connector in every chat, run and route that loads connector permissions.';

drop trigger if exists set_connector_account_states_updated_at
  on public.connector_account_states;
create trigger set_connector_account_states_updated_at
  before update on public.connector_account_states
  for each row execute function public.set_row_updated_at();

alter table public.connector_account_states enable row level security;
alter table public.connector_account_states force row level security;

revoke all on public.connector_account_states from public;
grant select, insert, update, delete on public.connector_account_states to app_rls;

drop policy if exists connector_account_states_owner on public.connector_account_states;
create policy connector_account_states_owner
  on public.connector_account_states
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

commit;
