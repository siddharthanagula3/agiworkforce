-- Reversal of 0325 : managed usage rows stop recording the attempt's
-- conversation and how it ended.
--
-- WHAT THIS COSTS: every recorded conversation link, attempt outcome and error
-- class is dropped. The usage rows themselves, their settlement and billing
-- are kept.

begin;

drop index if exists public.idx_managed_usage_requests_conversation;

alter table public.managed_usage_requests
  drop column if exists attempt_error_class,
  drop column if exists attempt_outcome,
  drop column if exists conversation_id;

delete from public.schema_migrations
 where filename = '0325_managed_usage_attempt_record.sql';

commit;
