-- 0155 — remember which sandbox image and branch a Code session was built from.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- Every Code session was created from the E2B SDK's default image because
-- nothing ever passed a template to Sandbox.create. The session row could not
-- record a choice it was never offered.
--
-- The column is the E2B template id, and it is nullable because every existing
-- row predates the choice — a null means "the default image", which is exactly
-- what those sessions ran on, so no backfill is correct or needed.
--
-- Text rather than a foreign key or an enum: the catalogue lives in E2B, not
-- here. A template can be renamed, rebuilt or deleted in their console without
-- this database knowing, and a session that outlives its template should still
-- report honestly what it was built from rather than fail a constraint.

alter table public.cloud_code_sessions
  add column if not exists runtime_id text;

comment on column public.cloud_code_sessions.runtime_id is
  'E2B template id the sandbox was created from. Null means the SDK default image.';

-- The branch is recorded for the same reason: a workspace cloned from a
-- non-default ref should be able to say so. Null means the repository's own
-- default branch, which is what every existing row cloned.

alter table public.cloud_code_sessions
  add column if not exists repository_branch text;

comment on column public.cloud_code_sessions.repository_branch is
  'Git ref cloned into the workspace. Null means the repository default branch.';
