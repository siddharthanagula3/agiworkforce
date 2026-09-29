-- Reversal of 0347 : a request can no longer be reserved on extra usage alone.
--
-- WHAT THIS COSTS: fast mode requests are refused until 0347 is applied again,
-- because the gateway reserves them only on extra usage.

begin;

drop function if exists public.reserve_managed_usage_request_on_extra_usage_microusd(
  text, text, text, text, text, bigint, text, integer, boolean, bigint
);

delete from public.schema_migrations
 where filename = '0347_managed_usage_extra_usage_reservation.sql';

commit;
