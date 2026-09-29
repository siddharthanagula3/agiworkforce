-- Reversal of 0344 : conversations no longer remember that they hold Google
-- user data.
--
-- WHAT THIS COSTS: a conversation where a Google connector ran is routed by the
-- account's own training setting again, so a later turn can send Google user
-- data to a provider that may train on it.

begin;

alter table public.web_conversations drop column if exists google_user_data_at;

delete from public.schema_migrations
 where filename = '0344_conversation_google_user_data.sql';

commit;
