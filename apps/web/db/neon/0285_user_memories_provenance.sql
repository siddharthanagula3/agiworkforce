-- =============================================================================
-- Migration 0284: where a memory came from, recorded on the memory
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : user_memories recorded what was remembered and who it belonged to,
--          never where it was learned. A user who deletes the conversation a
--          fact was taken from had no way to find the fact, and an audit could
--          not tell a fact the user typed into Settings from one a model
--          extracted from a chat it was never meant to read.
--
-- Shape  : the two identities worth indexing get their own columns, because
--          tracing runs from a conversation or a turn to the memories it
--          produced. Everything else the canonical provenance model carries
--          (agent, model, provider route, prompt version, tool invocations,
--          schema version, trust mode) lives in one jsonb column, validated in
--          code before it is written rather than by fourteen more columns.
--
-- Depends: 0010 (user_memories), 0189 (per-user identity primary key)
-- =============================================================================

begin;

alter table public.user_memories
  add column if not exists source_conversation_id uuid,
  add column if not exists source_turn_id text
    check (source_turn_id is null or char_length(btrim(source_turn_id)) between 1 and 200),
  add column if not exists provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance) = 'object');

create index if not exists idx_user_memories_source_conversation
  on public.user_memories (user_id, source_conversation_id)
  where source_conversation_id is not null and is_deleted = false;

comment on column public.user_memories.source_conversation_id is
  'The conversation this memory was learned in. NULL for a memory the user typed in Settings or imported, which was never learned from a chat.';
comment on column public.user_memories.source_turn_id is
  'The turn within that conversation. Tracing a deleted turn to what it taught Memory starts here.';
comment on column public.user_memories.provenance is
  'The canonical provenance record for this memory: creator, agent, model, provider route, prompt version, tool invocations, creation time, schema version and trust mode. Empty for rows written before provenance was recorded.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Provenance is an object, never an array:
-- --    UPDATE public.user_memories SET provenance = '[]'::jsonb;
-- --    EXPECT: check violation.
--
-- -- 2. An empty turn id is refused:
-- --    UPDATE public.user_memories SET source_turn_id = '   ';
-- --    EXPECT: check violation.
--
-- -- 3. Existing rows are untouched and still readable:
-- --    SELECT count(*) FROM public.user_memories WHERE provenance <> '{}'::jsonb;
-- --    EXPECT: 0 immediately after the migration.
--
-- -- 4. Another user cannot read them (RLS from 0037 still applies):
-- --    SET ROLE app_rls; SELECT set_config('app.user_id', 'user_2', true);
-- --    SELECT count(*) FROM public.user_memories;  -- EXPECT: only user_2 rows
