-- Reversal of 0239, remove the purge access path and the column comments.
--
-- COST, read this before running it: nothing is deleted and no row changes,
-- but after this the purge sweep in apps/web/lib/resources has no index for
-- `deleted_at is not null`, so a sweep over a large table falls back to a
-- sequential scan under a delete. Stop the sweep before running this, or the
-- recovery window is enforced at the cost of a table scan per run.

begin;

drop index if exists public.idx_web_conversations_purge_due;
drop index if exists public.idx_web_messages_purge_due;
drop index if exists public.idx_web_artifacts_purge_due;
drop index if exists public.idx_user_projects_purge_due;
drop index if exists public.idx_project_knowledge_files_purge_due;
drop index if exists public.idx_media_assets_purge_due;

comment on column public.web_conversations.deleted_at is null;
comment on column public.web_messages.deleted_at is null;
comment on column public.web_artifacts.deleted_at is null;
comment on column public.user_projects.deleted_at is null;
comment on column public.project_knowledge_files.deleted_at is null;
comment on column public.media_assets.deleted_at is null;

delete from public.schema_migrations
 where filename = '0239_resource_deletion_semantics.sql';

commit;
