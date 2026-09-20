-- Reversal of the context manifest accounting columns.
--
-- COST, read this before running it: every manifest loses its token accounting,
-- the versions it was assembled against, and its own identity, so a recorded
-- turn can no longer be told apart from one built by a different assembler or
-- against a Memory state that has since moved. Live chat is unaffected: the
-- manifest is a best-effort record, not part of the answer.

begin;

drop index if exists public.idx_context_manifests_manifest_id;

alter table public.context_manifests
  drop column if exists manifest_id,
  drop column if exists assembler_version,
  drop column if exists token_estimate,
  drop column if exists actual_token_count,
  drop column if exists budget_tokens,
  drop column if exists reserved_output_tokens,
  drop column if exists over_budget,
  drop column if exists temporary_chat,
  drop column if exists versions;

-- destructive: removes this migration's ledger row so the runner can apply it again.
delete from public.schema_migrations
 where filename = '0283_context_manifest_accounting.sql';

commit;
