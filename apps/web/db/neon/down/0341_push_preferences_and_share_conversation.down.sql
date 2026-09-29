-- Reversal of 0341 : devices lose their stored push preferences and shared
-- links lose the chat they came from.
--
-- WHAT THIS COSTS: a category turned off on a phone rings again while the app
-- is closed, and deleting a chat leaves its shared links working.

begin;

drop index if exists public.idx_shared_sessions_conversation_id;

alter table public.shared_sessions drop column if exists conversation_id;
alter table public.mobile_devices drop column if exists push_preferences;

delete from public.schema_migrations
 where filename = '0341_push_preferences_and_share_conversation.sql';

commit;
