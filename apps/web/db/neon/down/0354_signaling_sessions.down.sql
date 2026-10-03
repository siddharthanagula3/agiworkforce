-- Reversal of 0354 removes stored pairings and their rotated peer credentials.
-- Reconnecting clients must pair again; dropping the table also makes the
-- current relay fail readiness until its pairing store is restored.

begin;

drop table if exists public.signaling_sessions;

delete from public.schema_migrations where filename = '0354_signaling_sessions.sql';

commit;
