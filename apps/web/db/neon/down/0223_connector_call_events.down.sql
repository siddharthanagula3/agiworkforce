-- Reversal of 0223, drop the connector call log.
--
-- The rows already recorded are discarded with the table. Nothing else is lost:
-- the cost accrual for each call is its own row in provider_cost_events (0221),
-- and connect and disconnect stay in the audit trail. Connector health falls
-- back to the configuration-only answer it gave before this migration, so a
-- connector whose provider is refusing calls reads 'connected' again.

begin;

drop policy if exists connector_call_events_user_isolation on public.connector_call_events;

alter table public.connector_call_events disable row level security;
alter table public.connector_call_events no force row level security;

drop index if exists public.idx_connector_call_events_organization;
drop index if exists public.idx_connector_call_events_health;
drop index if exists public.idx_connector_call_events_user_occurred;

drop table if exists public.connector_call_events;

delete from public.schema_migrations
 where filename = '0223_connector_call_events.sql';

commit;
