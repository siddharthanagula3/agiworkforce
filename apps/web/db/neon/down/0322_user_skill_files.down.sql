-- Reversal of 0322 : personal skills keep only their SKILL.md.
--
-- WHAT THIS COSTS: every file a personal skill bundles is deleted, so its
-- references can no longer be read and its scripts no longer run. The skills
-- themselves and their instructions are untouched.

begin;

drop policy if exists user_skill_files_owner on public.user_skill_files;
drop trigger if exists user_skill_files_assign_version on public.user_skill_files;
drop trigger if exists set_user_skill_files_updated_at on public.user_skill_files;
drop index if exists public.user_skill_files_user_idx;
drop table if exists public.user_skill_files;

delete from public.schema_migrations
 where filename = '0322_user_skill_files.sql';

commit;
