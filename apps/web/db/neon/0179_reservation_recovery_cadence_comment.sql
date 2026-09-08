-- 0179 : say who actually calls the reservation recovery sweep.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Migration 0056 shipped `recover_stale_managed_usage_requests` with a comment
-- claiming "the existing /api/cron/reconcile-credits route invokes this
-- function every minute". It never did: vercel.json scheduled that route at
-- `30 0 * * *`, once a day, and the route makes one call per firing. A
-- reservation that went stale just after the sweep held the user's quota for
-- close to 24 hours, and a backlog above the 500-row cap drained a day at a
-- time. The claim was read as documentation by more than one reader and cost
-- an investigation each time.
--
-- 0056 is applied, so its text is frozen and the ledger hashes it. The
-- function's own comment is the one description a reader gets from the
-- database rather than from a file, so it is where the correction belongs.
--
-- The cadence itself now lives in /api/cron/recover-reservations at
-- `0,15,30,45 * * * *`. This migration only changes what the database says
-- about itself; no function body and no row is touched.

comment on function public.recover_stale_managed_usage_requests(integer) is
  'Releases reservations whose lease expired without a terminal outcome, refunding the user. Scheduled by /api/cron/recover-reservations four times an hour, and again by the daily /api/cron/reconcile-credits drain as a backstop. Safe to run concurrently: rows are taken for update skip locked and every settlement is idempotent by key. Batch size is clamped to 500 per call, so a deeper backlog drains across sweeps.';
