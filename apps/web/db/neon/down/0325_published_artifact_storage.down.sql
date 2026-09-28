begin;

drop policy if exists published_artifact_storage_viewer_delete on public.published_artifact_storage;
drop policy if exists published_artifact_storage_viewer_update on public.published_artifact_storage;
drop policy if exists published_artifact_storage_viewer_insert on public.published_artifact_storage;
drop policy if exists published_artifact_storage_viewer_read on public.published_artifact_storage;
alter table if exists public.published_artifact_storage no force row level security;
alter table if exists public.published_artifact_storage disable row level security;
drop trigger if exists set_published_artifact_storage_updated_at
  on public.published_artifact_storage;
drop index if exists public.published_artifact_storage_key_idx;
alter table if exists public.published_artifact_storage
  drop constraint if exists published_artifact_storage_value_size;
drop table if exists public.published_artifact_storage;
drop function if exists public.app_can_run_published_artifact(uuid);
drop function if exists public.app_runnable_published_artifact(text);

delete from public.schema_migrations
 where filename = '0325_published_artifact_storage.sql';

commit;
