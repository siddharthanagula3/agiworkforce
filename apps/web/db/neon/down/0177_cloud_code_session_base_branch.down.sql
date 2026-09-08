-- Reversal of 0177 : forget which branch a Code session was cloned from.
--
-- WHAT THIS COSTS: the Changes panel loses the base half of its branch flow for
-- every session, and cannot get it back. The branch still exists on GitHub and
-- the working branch is still recorded; this product just stops knowing what
-- the work was branched from, and the panel goes back to naming nothing.
--
-- Nothing else reads the column, so this is safe to run at any time.

begin;

alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_base_branch_ref;

alter table public.cloud_code_sessions
  drop column if exists base_branch;

delete from public.schema_migrations
 where filename = '0177_cloud_code_session_base_branch.sql';

commit;
