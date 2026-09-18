-- Down migration for 0263_release_audit_trail.
-- Drops the release audit trail and its writer. The trail is evidence, so this
-- is a rollback of a failed deploy of the feature, never a retention action.

begin;

drop trigger if exists release_events_append_only on public.release_events;
drop function if exists public.release_events_are_append_only();
drop function if exists public.append_release_event(
  text, text, text, text, text, text, text, text, text, text, text, jsonb
);
drop table if exists public.release_events;

delete from public.schema_migrations
 where filename = '0263_release_audit_trail.sql';

commit;
