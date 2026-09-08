-- 0177 : remember which branch a Code session was cloned from.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- The Changes panel draws a branch flow, base to working branch, and had no
-- base to name. `repository_branch` answers only when the reader asked for a
-- particular ref; left null, which is the common case, the clone checked out
-- whatever the repository calls its default and nothing recorded what that was.
-- The diff was taken against `origin/HEAD`, and the panel had nothing better to
-- print than that string, which names a git internal rather than a branch.
--
-- WHY NOT REUSE repository_branch: it is the ref the request ASKED for, and
-- `sameCreateRequest` compares it against the request when deciding whether a
-- retried requestId is the same create. Writing the resolved default into it
-- would make an identical retry look like a different request and fail with
-- "requestId was already used with different session details". The two columns
-- answer different questions: one what was asked for, one what was checked out.
--
-- Null stays meaningful here too: a session with no repository has no base, and
-- so does every session created before this column. The read path treats null
-- as "not known" and the panel says so rather than naming a branch it guessed.
--
-- The check is the same plain-ref shape 0176 put on working_branch, for the
-- same reason: this value reaches git as an argument, and the application
-- validating it first is not a reason for the schema to accept anything.

alter table public.cloud_code_sessions
  add column if not exists base_branch text;

alter table public.cloud_code_sessions
  drop constraint if exists cloud_code_sessions_base_branch_ref;
alter table public.cloud_code_sessions
  add constraint cloud_code_sessions_base_branch_ref
  check (
    base_branch is null
    or base_branch ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$'
  );

comment on column public.cloud_code_sessions.base_branch is
  'The branch the clone actually checked out, resolved at provisioning: the requested ref when one was asked for, otherwise the repository default. Null for sessions with no repository and for sessions created before this column. Distinct from repository_branch, which records what the create request asked for.';
