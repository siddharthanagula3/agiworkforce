-- Reversal of 0369 deletes every artifact comment and reply. They cannot be
-- recovered from anywhere else; the artifacts themselves are untouched.

begin;

drop policy if exists artifact_comments_user_isolation on public.artifact_comments;
alter table if exists public.artifact_comments disable row level security;
alter table if exists public.artifact_comments no force row level security;
drop index if exists public.idx_artifact_comments_parent;
drop index if exists public.idx_artifact_comments_user_artifact;
drop table if exists public.artifact_comments;

delete from public.schema_migrations where filename = '0369_artifact_comments.sql';

commit;
