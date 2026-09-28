-- Reversal of 0311 : schedules can no longer be shared.
--
-- WHAT THIS COSTS: every schedule share link stops resolving and its snapshot
-- is deleted. Schedules created from a share are the recipients' own and are
-- untouched.

begin;

drop policy if exists scheduled_task_shares_owner on public.scheduled_task_shares;
drop trigger if exists scheduled_task_shares_assign_version on public.scheduled_task_shares;
drop trigger if exists set_scheduled_task_shares_updated_at on public.scheduled_task_shares;
drop index if exists public.scheduled_task_shares_user_idx;
drop index if exists public.scheduled_task_shares_live_task_idx;
drop table if exists public.scheduled_task_shares;

delete from public.schema_migrations
 where filename = '0311_scheduled_task_shares.sql';

commit;
