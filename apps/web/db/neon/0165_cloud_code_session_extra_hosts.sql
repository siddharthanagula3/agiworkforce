-- 0165 : remember the extra egress hosts a Code session allowlisted.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Session creation can allowlist extra hostnames on top of the
-- none/trusted/full network preset, applied through E2B network rules. Until
-- now there was nowhere durable to keep that choice: the sandbox's own Redis
-- session record is disposable (24h TTL, cleared on session close) and does
-- not survive the session's own lifetime the way this row does. This column
-- is the durable record, read back so the Code page can show what a session
-- was actually allowed to reach, so a resumed or reconstructed sandbox scope
-- can still enforce it, and so a retried create request can tell a changed
-- extraHosts list apart from an identical retry.
--
-- Every existing row predates the field: default '{}' is correct for them,
-- since no prior session ever had an extra-host allowlist.

alter table public.cloud_code_sessions
  add column if not exists extra_hosts text[] not null default '{}';

comment on column public.cloud_code_sessions.extra_hosts is
  'Extra hostnames allowlisted on top of the network_access preset, at most 10 entries, validated at the API layer.';
