-- =============================================================================
-- Reversal: 0120_delete_user_data_execute_narrowing.sql
--
-- Restores the PUBLIC EXECUTE grant on `public.delete_user_data(text)` that the
-- forward migration revoked. That is what Postgres grants a new function by
-- default, so this puts the privilege state back exactly as 0043 left it.
--
-- Be clear about what running this reinstates: `delete_user_data` is SECURITY
-- DEFINER and takes the target user id as a parameter, so with EXECUTE granted
-- to PUBLIC any grantee can purge ANY user's audit rows by passing their id —
-- the SEC-89 finding, and the reason the forward migration exists. Roll this
-- back only to unblock an environment that genuinely still depends on the
-- legacy erasure path (one that has not applied 0105 and so has no
-- `video_generation_jobs` table), and treat it as temporary.
-- =============================================================================

begin;

grant execute on function public.delete_user_data(text) to public;

delete from public.schema_migrations
where filename = '0120_delete_user_data_execute_narrowing.sql';

commit;
