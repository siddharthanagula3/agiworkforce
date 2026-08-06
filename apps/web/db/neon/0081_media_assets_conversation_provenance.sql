-- 0081: Give generated files provenance back to the conversation that made them.
--
-- WHY
-- PRD §17 requires every generated output to track its "Compute/session route",
-- and the parity matrix requires `ComputeSession` + owner + defined deletion
-- behavior for generated files. `media_assets` (0036) shipped with neither a
-- conversation nor a session reference — only `user_id` — and the insert path
-- never wrote one into `metadata` either. Consequences:
--
--   * The Library ("Files generated in your conversations") could not tell you
--     which conversation any file came from, because the relation did not exist.
--   * Deleting a conversation could not affect its files even in principle —
--     there was nothing to join on. This read as a broken cascade; it was a
--     missing relation.
--
-- DELIBERATELY NOT A CASCADE
-- `on delete set null`, not `on delete cascade`, and conversation deletion is
-- left alone. Generated files outlive the chat that produced them: the
-- reference product keeps artifacts in a dedicated section with their own
-- delete control, and the Library already ships soft-delete plus a 30-day
-- "Recently deleted" bin, so users have an explicit way to remove files. Tying
-- destruction of finished work to tidying up a chat history would be surprising
-- and unrecoverable. Cascade remains available as a later, explicit product
-- choice — it is not smuggled in with the provenance column.
--
-- Account deletion is unaffected and already correct: `account-erasure.ts`
-- removes media_assets rows and their R2 objects (bytes first, so a failed
-- object delete retains storage_pathname for retry).
--
-- BACKFILL
-- None is possible. Rows written before this migration carry no conversation
-- reference anywhere, so they stay NULL — correctly representing "unknown
-- origin" rather than guessing one. The column is nullable for that reason and
-- because uploads (origin = 'uploaded') legitimately have no source conversation.

alter table public.media_assets
  add column if not exists conversation_id uuid
    references public.conversations(id) on delete set null;

comment on column public.media_assets.conversation_id is
  'Conversation that generated this asset. NULL for uploads, for assets created '
  'before migration 0081, and after the source conversation is deleted '
  '(on delete set null — deleting a chat never destroys generated files).';

-- Library filtering by source conversation. Partial: NULL rows are the
-- "unknown origin" bucket and are never the target of an equality lookup.
create index if not exists idx_media_assets_conversation
  on public.media_assets(conversation_id, created_at desc)
  where conversation_id is not null and deleted_at is null;
