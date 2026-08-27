-- 0149 — Put an expiry on the single-writer claim over a managed Code session
-- (expand step: the columns only).
--
-- A run flips a session to `running` and flips it back in a `finally`. That
-- `finally` does not run when the platform kills the function mid-turn, and
-- nothing swept the table, so one killed turn wedged the session at `running`
-- permanently: every later turn 409'd with "wait and try again", advice that
-- could never come true, and the user's only escape was a new session.
--
-- These columns turn that claim into a lease, following the same shape
-- `cloud_agent_approval_checkpoints` already uses for its execution lease
-- (0062): a random token identifying the holder plus an absolute expiry. The
-- token fences the holder's later writes, so a run that outlived its lease
-- cannot release or fail a session another run has since taken over.
--
-- The TTL lives in code (CLOUD_CODE_RUN_LEASE_SECONDS, 420 s) rather than in
-- the schema, because it is derived from the route's declared maxDuration.
--
-- DEPLOY ORDER — this file is the half that is safe to apply at any time.
-- Both columns are nullable and unconstrained, so the currently-deployed code,
-- which never mentions them, keeps writing `state = 'running'` rows exactly as
-- before. The invariant that a `running` session always carries a lease is a
-- CHECK, and it lands in 0150 once the code that writes the lease is live.
-- Apply this migration first, deploy the code, then apply 0150. Splitting the
-- two is what makes each step independently safe: a single migration carrying
-- the CHECK would reject every Code agent turn and terminal command issued by
-- the old code between the migration and the deploy.
--
-- The claim predicate in `claimCloudCodeSessionForRun` deliberately treats a
-- `running` row with a NULL expiry as stale, so a session wedged by the old
-- code — before this migration, or between it and the deploy — is reclaimed by
-- the next turn without any backfill. 0150 repairs those rows only because the
-- CHECK it adds cannot tolerate them.

begin;

alter table public.cloud_code_sessions
  add column run_lease_token uuid,
  add column run_lease_expires_at timestamptz;

create index cloud_code_sessions_expired_lease_idx
  on public.cloud_code_sessions(run_lease_expires_at)
  where state = 'running';

comment on column public.cloud_code_sessions.run_lease_token is
  'Identifies the run currently holding this session; fences that run''s release and failure writes after a reclaim.';
comment on column public.cloud_code_sessions.run_lease_expires_at is
  'Absolute expiry of the current run''s claim; a later run may reclaim the session once this passes.';

commit;
