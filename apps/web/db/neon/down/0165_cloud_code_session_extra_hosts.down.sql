-- Reversal of 0165 - forget the extra egress hosts a Code session allowlisted.
--
-- WHAT THIS COSTS: existing sessions lose the durable record of which extra
-- hosts they were allowed to reach; the Code page falls back to reporting
-- none, and a resumed sandbox stops re-applying them. The sandbox itself is
-- unaffected by this statement alone; this is a database record only.

begin;

alter table public.cloud_code_sessions
  drop column if exists extra_hosts;

delete from public.schema_migrations
 where filename = '0165_cloud_code_session_extra_hosts.sql';

commit;
