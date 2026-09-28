-- Reversal of 0323 : developer webhooks are removed.
--
-- WHAT THIS COSTS: every registered endpoint, its signing secret and the whole
-- delivery log are deleted, and no further event is sent to any endpoint.
-- Receivers keep whatever they already received.

begin;

drop policy if exists developer_webhook_deliveries_owner on public.developer_webhook_deliveries;
drop trigger if exists set_developer_webhook_deliveries_updated_at on public.developer_webhook_deliveries;
drop index if exists public.idx_developer_webhook_deliveries_user;
drop index if exists public.idx_developer_webhook_deliveries_endpoint;
drop table if exists public.developer_webhook_deliveries;

drop policy if exists developer_webhook_endpoints_owner on public.developer_webhook_endpoints;
drop trigger if exists set_developer_webhook_endpoints_updated_at on public.developer_webhook_endpoints;
drop index if exists public.idx_developer_webhook_endpoints_user;
drop table if exists public.developer_webhook_endpoints;

delete from public.schema_migrations
 where filename = '0323_developer_webhooks.sql';

commit;
