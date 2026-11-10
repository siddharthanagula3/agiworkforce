-- =============================================================================
-- Migration 0403: the upgrade waitlist scan remembers when it last checked an
--                 account
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : The upgrades-open notice checks each waitlisted account's upgrade
--          switch before telling it. A run examines at most ten batches, and
--          every run started again from the oldest account, so more closed
--          accounts than one run examines kept every later account from ever
--          being reached, even after its own upgrades opened.
--
-- Shape  : One nullable timestamp on public.waitlist, set on every row of an
--          account when a run found its upgrades still closed. The scan
--          orders accounts not yet told by this value, never-checked first,
--          so each run starts with the accounts checked longest ago and the
--          whole waitlist is covered across runs. A closed account is never
--          marked as told.
--
-- Empty  : existing rows keep null and are checked first, in join order, as
--          before. Adding a nullable column without a default rewrites
--          nothing.
--
-- Depends: 0011 (waitlist), 0365 (upgrade waitlist notice delivery)
-- =============================================================================

begin;

alter table public.waitlist
  add column if not exists upgrade_access_checked_at timestamptz;

comment on column public.waitlist.upgrade_access_checked_at is
  'When the upgrades-open notice last found this account''s upgrades still closed. Set on every row of the account together; null means never checked. The scan takes the least recently checked accounts first.';

commit;
