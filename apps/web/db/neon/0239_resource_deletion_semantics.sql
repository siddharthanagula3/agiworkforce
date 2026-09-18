-- 0239 : give every soft-deletable resource a purge, not only a tombstone.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Six tables carry `deleted_at`: web_conversations, web_messages,
-- web_artifacts, user_projects, project_knowledge_files and media_assets.
-- Only the last had a purge. Everything else kept its soft-deleted rows for
-- ever, so "delete" meant "hide", and the product told a user their chat was
-- deleted while its text, its artifacts and its attachments stayed on disk
-- indefinitely. A recovery window that never ends is not a window.
--
-- The window itself lives in apps/web/lib/resources/deletion-policies.ts,
-- which is what the sweep builds its statement from. What this migration adds
-- is the access path that statement needs and the record of the contract at
-- the column, because every index that exists today is the mirror image of
-- what a purge asks for: they are all `where deleted_at is null`, built for
-- reading live rows, and none of them can answer "which tombstones are older
-- than the window".
--
-- No row is deleted here and no default changes. Applying this migration
-- deletes nothing; the sweep that uses these indexes is a separate, scheduled
-- decision.
--
-- Depends: 0001_mvp_chat (web_conversations, web_messages)
--          0035_project_knowledge_file_lifecycle (project_knowledge_files)
--          0036_media_assets, 0038_cloud_sync_versioning (web_messages)
--          0039_artifact_cloud_sync (web_artifacts)
--          0041_projects_cloud_sync (user_projects)

begin;

create index if not exists idx_web_conversations_purge_due
  on public.web_conversations (deleted_at)
  where deleted_at is not null;

create index if not exists idx_web_messages_purge_due
  on public.web_messages (deleted_at)
  where deleted_at is not null;

create index if not exists idx_web_artifacts_purge_due
  on public.web_artifacts (deleted_at)
  where deleted_at is not null;

create index if not exists idx_user_projects_purge_due
  on public.user_projects (deleted_at)
  where deleted_at is not null;

create index if not exists idx_project_knowledge_files_purge_due
  on public.project_knowledge_files (deleted_at)
  where deleted_at is not null;

create index if not exists idx_media_assets_purge_due
  on public.media_assets (deleted_at)
  where deleted_at is not null;

comment on column public.web_conversations.deleted_at is
  'Soft delete. The row is restorable until the recovery window in deletion-policies.ts elapses, then the purge removes it and cascades to web_messages and web_artifacts.';

comment on column public.web_messages.deleted_at is
  'Soft delete. Restorable until the recovery window elapses. A deleted message marks its conversation document stale rather than removing an index entry of its own.';

comment on column public.web_artifacts.deleted_at is
  'Soft delete. Restorable until the recovery window elapses, then the purge removes the row, its version history and its retrieval document.';

comment on column public.user_projects.deleted_at is
  'Soft delete. Restorable until the recovery window elapses, then the purge removes the project and cascades to project_knowledge_files; scheduled_tasks keep running with their project link cleared.';

comment on column public.project_knowledge_files.deleted_at is
  'Soft delete, distinct from superseded_at: superseded means replaced by a newer version and is not deletion. Restorable until the recovery window elapses.';

comment on column public.media_assets.deleted_at is
  'Soft delete. Restorable until the recovery window elapses, which is the window the library purge already enforced.';

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. Nothing was deleted by applying this file:
-- --    SELECT count(*) FROM public.web_conversations WHERE deleted_at IS NOT NULL;
-- --    EXPECT: the same count as before the apply.
--
-- -- 2. The purge query uses the new index rather than a sequential scan:
-- --    EXPLAIN SELECT id FROM public.web_conversations
-- --     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'
-- --     ORDER BY deleted_at ASC LIMIT 2000;
-- --    EXPECT: Index Scan using idx_web_conversations_purge_due
--
-- -- 3. A live-row read still uses the older partial index:
-- --    EXPLAIN SELECT id FROM public.web_conversations
-- --     WHERE user_id = 'u' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20;
-- --    EXPECT: Index Scan using idx_web_conversations_user_updated
-- =============================================================================
