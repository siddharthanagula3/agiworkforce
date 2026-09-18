-- Reversal of 0266 : drops the per-action automation audit trail.
--
-- WHAT THIS COSTS: every receipt for a browser, computer-use or remote-control
-- action is destroyed, and they cannot be rebuilt. The enterprise stream keeps
-- only its per-run roll-up, so after this nobody can answer "which site did
-- that run click on, on which device" for any run already finished. Export
-- the table first if anything still depends on it.

begin;

drop policy if exists automation_audit_events_user_isolation
  on public.automation_audit_events;

drop table if exists public.automation_audit_events;

delete from public.schema_migrations
 where filename = '0266_automation_audit_events.sql';

commit;
