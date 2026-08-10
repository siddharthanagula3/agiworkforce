-- Reversal of 0106 — GitHub webhook delivery replay protection.
--
-- Dropping this table removes replay protection only; no product data lives
-- here. After a rollback, redeliveries are again indistinguishable from first
-- deliveries, which is exactly the pre-0106 behavior.

BEGIN;

drop index if exists idx_github_webhook_deliveries_received_at;

drop table if exists public.github_webhook_deliveries;

delete from public.schema_migrations where filename = '0106_github_webhook_deliveries.sql';

COMMIT;
