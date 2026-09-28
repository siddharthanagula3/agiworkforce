-- Reversal of 0328 : plugins can no longer be submitted to the community
-- directory.
--
-- WHAT THIS COSTS: every submission, its file snapshot, its review state and
-- every install of an approved community plugin are deleted, so those
-- plugins leave the directory and their users lose their skills. The plugins
-- their submitters uploaded or created are untouched.

begin;

drop policy if exists plugin_submission_installs_owner on public.plugin_submission_installs;
drop policy if exists plugin_submission_files_approved_read on public.plugin_submission_files;
drop policy if exists plugin_submission_files_owner on public.plugin_submission_files;
drop policy if exists plugin_submissions_approved_read on public.plugin_submissions;
drop policy if exists plugin_submissions_owner on public.plugin_submissions;
drop trigger if exists plugin_submission_installs_assign_version on public.plugin_submission_installs;
drop trigger if exists set_plugin_submission_installs_updated_at on public.plugin_submission_installs;
drop trigger if exists plugin_submission_files_assign_version on public.plugin_submission_files;
drop trigger if exists set_plugin_submission_files_updated_at on public.plugin_submission_files;
drop trigger if exists plugin_submissions_assign_version on public.plugin_submissions;
drop trigger if exists set_plugin_submissions_updated_at on public.plugin_submissions;
drop index if exists public.plugin_submission_installs_user_idx;
drop index if exists public.plugin_submission_files_user_idx;
drop index if exists public.plugin_submissions_approved_key_idx;
drop index if exists public.plugin_submissions_pending_key_idx;
drop index if exists public.plugin_submissions_status_idx;
drop index if exists public.plugin_submissions_user_idx;
drop table if exists public.plugin_submission_installs;
drop table if exists public.plugin_submission_files;
drop table if exists public.plugin_submissions;

delete from public.schema_migrations
 where filename = '0328_plugin_submissions.sql';

commit;
