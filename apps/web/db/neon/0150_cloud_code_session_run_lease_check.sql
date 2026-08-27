-- 0150 — Enforce the managed Code session lease invariant (contract step).
--
-- 0149 added `run_lease_token` and `run_lease_expires_at` as plain nullable
-- columns so it could be applied while the old code was still serving. This
-- migration adds the constraint that makes the pair meaningful, and it is only
-- safe once every writer sets both columns.
--
-- DEPLOY ORDER — apply this ONLY after the code that claims a Code session
-- under a lease (`claimCloudCodeSessionForRun`) is fully rolled out. Applied
-- earlier, the previously-deployed code still writes `state = 'running'` with
-- both lease columns NULL, and every Code agent turn and terminal command
-- fails the constraint. Rolling the code back is the mirror image: revert this
-- migration first, then the code, or the old code's very first claim errors.
--
-- The repair below is what lets the constraint validate. Rows left at
-- `running` by the old code carry no lease and their run is long gone, so they
-- get an expiry in the past: the next turn reclaims them rather than 409'ing
-- forever, which is the wedge this whole feature exists to end.

begin;

update public.cloud_code_sessions
   set run_lease_token = coalesce(run_lease_token, gen_random_uuid()),
       run_lease_expires_at = coalesce(run_lease_expires_at, now() - interval '1 second')
 where state = 'running'
   and (run_lease_token is null or run_lease_expires_at is null);

update public.cloud_code_sessions
   set run_lease_token = null,
       run_lease_expires_at = null
 where state <> 'running'
   and (run_lease_token is not null or run_lease_expires_at is not null);

-- Mirrors the 0062 invariant: a lease exists exactly while the session is held.
alter table public.cloud_code_sessions
  add constraint cloud_code_sessions_run_lease_chk check (
    (state = 'running' and run_lease_token is not null and run_lease_expires_at is not null)
    or (state <> 'running' and run_lease_token is null and run_lease_expires_at is null)
  );

commit;
