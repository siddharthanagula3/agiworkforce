-- Reversal of 0164, drop the admin memory gate and the cached compaction
-- summary columns.
--
-- Every workspace's saved allow_memory choice and every conversation's
-- cached compaction summary is lost. Nothing else depends on either column,
-- so the only cost is that a compaction summary regenerates on next use and
-- an admin who turned memory on has to turn it on again after a re-apply.

begin;

alter table public.web_conversations
  drop column if exists compaction_summary_through_message_id,
  drop column if exists compaction_summary;

alter table public.organization_admin_policies
  drop column if exists allow_memory;

delete from public.schema_migrations
 where filename = '0164_memory_policy_and_context_compaction.sql';

commit;
