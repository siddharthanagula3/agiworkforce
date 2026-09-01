-- Reversal of 0156 — collapse every threaded conversation back to a flat list.
--
-- WHAT THIS COSTS: no message is deleted, but the shape connecting them is.
-- Every variant a user kept — the regenerations they paged between, the edited
-- questions and their divergent tails — stops being a variant and becomes an
-- ordinary turn appended at its own created_at, so a branched conversation
-- reads as if the user had asked the same thing several times in a row. The
-- reader's chosen path is lost with the leaf and cannot be recovered from the
-- remaining columns, because created_at cannot say which sibling was picked.
-- Rerunning 0156 afterwards brings back the columns, not the topology.

begin;

alter table public.web_conversations
  drop column if exists active_leaf_message_id;

drop index if exists public.idx_web_messages_conversation_parent;

alter table public.web_messages
  drop column if exists parent_id;

delete from public.schema_migrations
 where filename = '0156_message_thread_variants.sql';

commit;
