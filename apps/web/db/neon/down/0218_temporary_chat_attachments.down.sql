-- Reversal of 0218, drop the temporary-chat marker on uploads.
--
-- Files already marked reappear in the Library and stop being purged with the
-- chat that received them; nothing is deleted by this reversal. Run it only if
-- the Temporary Chat file policy is being withdrawn deliberately.

begin;

drop index if exists public.idx_media_assets_temporary_chat;

alter table public.media_assets
  drop column if exists temporary_chat;

delete from public.schema_migrations
 where filename = '0218_temporary_chat_attachments.sql';

commit;
