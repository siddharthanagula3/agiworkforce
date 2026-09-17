-- Reversal of 0219, drop the synced composer draft.
--
-- Drafts already stored are discarded with the columns. Nothing else is lost:
-- a draft is unsent text, never part of the transcript, and the composer falls
-- back to the per-tab copy it kept before this migration.

begin;

alter table public.web_conversations
  drop column if exists draft_updated_at,
  drop column if exists draft;

delete from public.schema_migrations
 where filename = '0219_conversation_drafts.sql';

commit;
