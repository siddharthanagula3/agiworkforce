-- =============================================================================
-- Migration 0344: remember that a conversation holds Google user data
--
-- Why    : Google API Limited Use forbids sending Google user data to a model
--          provider that may train on it. The result of a Gmail, Google
--          Calendar, Google Drive or Google Contacts tool call stays in the
--          conversation history, so every later turn in that conversation,
--          text the user pastes included, carries it too.
--
-- Shape  : web_conversations gains google_user_data_at, set by the server the
--          first time a Google connector runs in the conversation or a turn
--          reads a project source imported from one. It is never cleared, and
--          while it is set every turn routes only to providers that keep
--          inputs out of training.
-- =============================================================================

begin;

alter table public.web_conversations
  add column if not exists google_user_data_at timestamptz;

-- Backfill: mark every conversation that already holds Google user data, so
-- turns in chats that predate this column are routed the same way. Evidence is
-- a persisted tool entry naming a Google connector (the client transcript's
-- metadata.tools, or the server's toolInvocations when a tool ran), or a
-- project source imported from a Google connector. Offered-and-observed counts
-- even when another tool was the one that ran: over-marking only narrows
-- routing. Directory ids are the 'dir-' digests of the same connector ids.
-- Bounded by the statement timeout; safe to run twice, as a marked row no
-- longer matches.
set local statement_timeout = '10min';

update public.web_conversations c
   set google_user_data_at = now()
 where c.google_user_data_at is null
   and (
     exists (
       select 1
         from public.web_messages m
         cross join lateral jsonb_array_elements(
           case when jsonb_typeof(m.metadata -> 'tools') = 'array'
                then m.metadata -> 'tools' else '[]'::jsonb end
         ) as tool(entry)
        where m.conversation_id = c.id
          and (
            tool.entry ->> 'connectorId' = any (array['gmail', 'google-calendar', 'google-drive', 'google-contacts', 'google-sheets', 'google-analytics', 'youtube', 'bigquery', 'gcp', 'google-compute-engine', 'dir-576ba7c2e4ab', 'dir-a1c2783788b8', 'dir-f4165d77e160', 'dir-c0893fb395ee', 'dir-8d6cb37f3e99', 'dir-96c8d8fbe3ae', 'dir-24e6654bfd1a', 'dir-764a51ba6de8', 'dir-3347d0bdd97e', 'dir-7079c01aa6bc'])
            or substring(tool.entry ->> 'name' from '^mcp__([^_][^_]*)__') = any (array['gmail', 'google-calendar', 'google-drive', 'google-contacts', 'google-sheets', 'google-analytics', 'youtube', 'bigquery', 'gcp', 'google-compute-engine', 'dir-576ba7c2e4ab', 'dir-a1c2783788b8', 'dir-f4165d77e160', 'dir-c0893fb395ee', 'dir-8d6cb37f3e99', 'dir-96c8d8fbe3ae', 'dir-24e6654bfd1a', 'dir-764a51ba6de8', 'dir-3347d0bdd97e', 'dir-7079c01aa6bc'])
          )
     )
     or exists (
       select 1
         from public.web_messages m
         cross join lateral jsonb_array_elements_text(
           case when jsonb_typeof(m.metadata -> 'toolInvocations' -> 'offered') = 'array'
                then m.metadata -> 'toolInvocations' -> 'offered' else '[]'::jsonb end
         ) as offered(name)
        where m.conversation_id = c.id
          and (m.metadata -> 'toolInvocations' ->> 'observed') = 'true'
          and substring(offered.name from '^mcp__([^_][^_]*)__') = any (array['gmail', 'google-calendar', 'google-drive', 'google-contacts', 'google-sheets', 'google-analytics', 'youtube', 'bigquery', 'gcp', 'google-compute-engine', 'dir-576ba7c2e4ab', 'dir-a1c2783788b8', 'dir-f4165d77e160', 'dir-c0893fb395ee', 'dir-8d6cb37f3e99', 'dir-96c8d8fbe3ae', 'dir-24e6654bfd1a', 'dir-764a51ba6de8', 'dir-3347d0bdd97e', 'dir-7079c01aa6bc'])
     )
     or exists (
       select 1
         from public.project_knowledge_files f
         join public.external_resource_references r on r.id = f.external_reference_id
        where c.project_id is not null
          and f.project_id::text = c.project_id
          and r.connector_id = any (array['gmail', 'google-calendar', 'google-drive', 'google-contacts', 'google-sheets', 'google-analytics', 'youtube', 'bigquery', 'gcp', 'google-compute-engine', 'dir-576ba7c2e4ab', 'dir-a1c2783788b8', 'dir-f4165d77e160', 'dir-c0893fb395ee', 'dir-8d6cb37f3e99', 'dir-96c8d8fbe3ae', 'dir-24e6654bfd1a', 'dir-764a51ba6de8', 'dir-3347d0bdd97e', 'dir-7079c01aa6bc'])
     )
   );

commit;
