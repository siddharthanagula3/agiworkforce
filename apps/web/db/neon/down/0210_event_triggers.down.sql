-- Reversal of 0210 : drop event triggers and their delivery audit trail.
--
-- WHAT THIS COSTS: every trigger and its delivery history is deleted. Gmail,
-- Slack, Calendar, GitHub and connector events stop starting scheduled tasks;
-- queued trigger jobs in background_jobs fail permanently when they run.
-- Event-only tasks (0209) remain but nothing fires them.

begin;

drop policy if exists event_trigger_events_owner_read on public.event_trigger_events;
drop policy if exists event_triggers_owner_delete on public.event_triggers;
drop policy if exists event_triggers_owner_update on public.event_triggers;
drop policy if exists event_triggers_owner_insert on public.event_triggers;
drop policy if exists event_triggers_owner_read on public.event_triggers;
alter table if exists public.event_trigger_events disable row level security;
alter table if exists public.event_triggers disable row level security;

drop index if exists public.idx_event_trigger_events_user;
drop index if exists public.idx_event_trigger_events_received;
drop index if exists public.idx_event_trigger_events_trigger;
drop index if exists public.idx_event_triggers_organization;
drop index if exists public.idx_event_triggers_task;
drop index if exists public.idx_event_triggers_user;
drop index if exists public.idx_event_triggers_source_account;

alter table if exists public.event_trigger_events
  drop constraint if exists event_trigger_events_delivery_unique;
alter table if exists public.event_triggers
  drop constraint if exists event_triggers_account_required;

drop table if exists public.event_trigger_events;
drop table if exists public.event_triggers;

delete from public.schema_migrations
 where filename = '0210_event_triggers.sql';

commit;
