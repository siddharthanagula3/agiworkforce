-- 0164 : the admin memory gate and the cached context-compaction summary.
--
-- NOT YET APPLIED, draft only, pending explicit approval before running.
--
-- Two unrelated additive changes, bundled because both are single-column
-- ships with no backfill risk.
--
-- allow_memory on organization_admin_policies: Team and Enterprise workspace
-- memory stays off until the owner turns it on, matching how Claude Team and
-- Enterprise and ChatGPT Enterprise gate it. Defaulting false means every
-- existing workspace keeps memory off until an admin makes the explicit
-- choice, the same direction 0138 and 0140 took with retention and sharing.
-- A personal account (no organization) is untouched, it keeps the per-user
-- switch this column never reaches.
--
-- compaction_summary / compaction_summary_through_message_id on
-- web_conversations: when trimming a conversation to fit its model's context
-- window would drop messages, those messages are summarized once and the
-- summary is cached here instead of being regenerated every turn. The
-- boundary column names the last message the cached summary covers, so a
-- later turn can tell whether the cache still holds or needs to extend past
-- it. Both nullable: most conversations never grow long enough to compact.

begin;

alter table public.organization_admin_policies
  add column if not exists allow_memory boolean not null default false;

comment on column public.organization_admin_policies.allow_memory is
  'When false, no member of this workspace gets managed account memory, regardless of their personal memory setting. Off by default; an owner or admin must turn it on.';

alter table public.web_conversations
  add column if not exists compaction_summary text,
  add column if not exists compaction_summary_through_message_id uuid
    references public.web_messages(id) on delete set null;

comment on column public.web_conversations.compaction_summary is
  'Cached summary of the oldest messages this conversation has dropped to fit a model context window. Reused while compaction_summary_through_message_id still names the current drop boundary, extended incrementally when it does not.';
comment on column public.web_conversations.compaction_summary_through_message_id is
  'The last message id the cached compaction_summary covers, in this conversation''s persisted message order.';

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No workspace gains memory as a side effect of this migration:
-- --    SELECT count(*) FROM public.organization_admin_policies WHERE allow_memory;
-- --                                                              -- EXPECT: 0
--
-- -- 2. No conversation has a stale boundary pointing outside its own thread:
-- --    SELECT c.id FROM public.web_conversations c
-- --     JOIN public.web_messages m ON m.id = c.compaction_summary_through_message_id
-- --    WHERE m.conversation_id <> c.id;                          -- EXPECT: 0 rows
-- =============================================================================
