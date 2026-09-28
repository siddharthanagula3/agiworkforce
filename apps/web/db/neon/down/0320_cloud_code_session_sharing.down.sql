-- Reversal of 0318 : Code sessions are owner-only again.
--
-- WHAT THIS COSTS: every shared Code session becomes private and its links stop
-- opening. The sessions themselves are untouched.

begin;

drop function if exists public.app_shared_cloud_code_session(text);

drop index if exists public.cloud_code_sessions_share_token_idx;

alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_share_check,
  drop column if exists share_token,
  drop column if exists share_visibility;

delete from public.schema_migrations
 where filename = '0318_cloud_code_session_sharing.sql';

commit;
