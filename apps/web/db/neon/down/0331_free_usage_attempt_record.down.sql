-- Reversal of 0331 : Free usage reservations stop recording the attempt's
-- conversation and how it ended, and free-pool turns stop writing a row.
--
-- WHAT THIS COSTS: every recorded conversation link, attempt outcome and error
-- class on Free reservations is dropped, and the zero-cost rows free-pool turns
-- wrote are deleted, since a reservation must again be above zero. Metered Free
-- reservations, their settlement and the usage windows they feed are kept.

begin;

drop index if exists public.idx_free_daily_usage_reservations_conversation;

alter table public.free_daily_usage_reservations
  drop column if exists attempt_error_class,
  drop column if exists attempt_outcome,
  drop column if exists conversation_id;

delete from public.free_daily_usage_reservations
 where reserved_microusd = 0;

alter table public.free_daily_usage_reservations
  drop constraint if exists free_daily_usage_reservations_reserved_microusd_check;

alter table public.free_daily_usage_reservations
  add constraint free_daily_usage_reservations_reserved_microusd_check
    check (reserved_microusd > 0);

delete from public.schema_migrations
 where filename = '0331_free_usage_attempt_record.sql';

commit;
