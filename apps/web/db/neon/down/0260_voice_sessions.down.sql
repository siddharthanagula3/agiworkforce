-- Reversal of 0260 : drops the canonical VoiceSession record.
--
-- WHAT THIS COSTS: every voice session record is gone, so a reconnect or a
-- second device can no longer resume a session, and the voice, language and
-- pace a past session ran with are no longer auditable. Live voice keeps
-- working; it goes back to a per-tab session with nothing behind it.

begin;

drop table if exists public.voice_sessions;

delete from public.schema_migrations
 where filename = '0260_voice_sessions.sql';

commit;
