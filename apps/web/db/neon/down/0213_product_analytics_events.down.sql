-- Reversal of 0213 : remove the product analytics stream and the daily metric
--                    snapshots computed from it.
--
-- WHAT THIS COSTS: every recorded product event is deleted, and with the daily
-- snapshots go the only record of how many accounts were paid on a given day,
-- which subscriptions carries nowhere else. Churn, expansion and every cohort
-- retention figure become unrecoverable for the period covered rather than
-- merely unavailable. The product keeps working; it stops measuring itself.

begin;

drop index if exists public.idx_product_metric_days_metric;
drop table if exists public.product_metric_days;

drop index if exists public.idx_product_analytics_events_user;
drop index if exists public.idx_product_analytics_events_occurred;
drop index if exists public.idx_product_analytics_events_name_occurred;
drop table if exists public.product_analytics_events;

delete from public.schema_migrations
 where filename = '0213_product_analytics_events.sql';

commit;
