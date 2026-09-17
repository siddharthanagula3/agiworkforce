-- Reversal of 0222.
--
-- Dropping these columns loses the queue order and the collected machine context
-- for every escalation and ticket raised while 0222 was in force. No customer
-- charge, no conversation content and no ticket body is derived from them, so the
-- loss is confined to support triage metadata.
--
-- The ticket rows themselves are untouched: 0024 created them and this migration
-- only added columns to them.

begin;

drop index if exists public.idx_support_tickets_handoff;
drop index if exists public.idx_support_tickets_status_priority;

alter table public.support_tickets
  drop column if exists handoff_session_id,
  drop column if exists support_tier,
  drop column if exists diagnostics;

drop index if exists public.idx_support_handoff_sessions_queue;

alter table public.support_handoff_sessions
  drop constraint if exists support_handoff_sessions_priority_check;

alter table public.support_handoff_sessions
  drop column if exists diagnostics,
  drop column if exists support_tier,
  drop column if exists priority;

delete from public.schema_migrations
 where filename = '0222_support_priority_and_diagnostics.sql';

commit;
