-- Reversal of 0176 : return Code sessions to no branch, no pull request, no
-- archive and no context accounting.
--
-- WHAT THIS COSTS: every session loses the branch it was working on and the
-- pull request it opened, and every turn loses its token counts. The branch
-- still exists on GitHub and the pull request is still open; this product just
-- stops knowing about them, so the Changes panel and the pull request link go
-- back to being unavailable rather than wrong. Any session archived at the
-- time is silently unarchived, which is the only outcome available once the
-- column is gone.
--
-- Run this only when nothing is mid-session: a turn that is cancelled while
-- cancel_requested_at is being dropped stops observing the request and runs to
-- its own conclusion.

begin;

alter table public.cloud_code_agent_turns
  drop constraint if exists cloud_code_agent_turns_tokens_non_negative;

alter table public.cloud_code_agent_turns
  drop column if exists cancel_requested_at,
  drop column if exists input_tokens,
  drop column if exists output_tokens;

alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_working_branch_ref;
alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_pull_request_paired;
alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_context_tokens_non_negative;

alter table public.cloud_code_sessions
  drop column if exists working_branch,
  drop column if exists pull_request_url,
  drop column if exists pull_request_number,
  drop column if exists archived_at,
  drop column if exists context_input_tokens,
  drop column if exists context_output_tokens;

delete from public.schema_migrations
 where filename = '0176_cloud_code_session_branch_and_context.sql';

commit;
