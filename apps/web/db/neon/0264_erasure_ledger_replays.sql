-- =============================================================================
-- Migration 0264: evidence for the post-restore erasure replay
--
-- Why    : 0103 records, in its own header, that a whole-database point-in-time
--          restore rolls erasure_tombstones back with the data it protects. A
--          restore to a point before an erasure therefore resurrects an account
--          that was legally erased, and nothing inside the database remembers
--          otherwise.
--
--          The suppression list now lives outside the Postgres timeline as well,
--          in the object backup bucket (lib/server/erasure-tombstones.ts). The
--          restore runbook replays it against the restored database before the
--          database serves traffic. This table is that replay's record: what the
--          ledger said, how many subjects the restore brought back, and who ran
--          it.
--
-- Shape  : one row per replay. ledger_digest is the sha-256 of the ledger as
--          read, so two replays of one restore can be shown to have read the
--          same list, and a ledger edited between them cannot hide it.
--
-- Note   : no organization reference. An erasure is per subject and the replay
--          is per database, so this is platform evidence, not tenant data, and
--          it is deliberately outside the organization erasure cascade.
--
-- Depends: 0103_erasure_tombstones
-- =============================================================================

begin;

create table if not exists public.erasure_ledger_replays (
  id uuid primary key default gen_random_uuid(),
  restore_point timestamptz,
  performed_by text not null,
  ledger_entries integer not null check (ledger_entries >= 0),
  ledger_digest text not null,
  re_armed integer not null default 0 check (re_armed >= 0),
  pending integer not null default 0 check (pending >= 0),
  unledgered integer not null default 0 check (unledgered >= 0),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_erasure_ledger_replays_created
  on public.erasure_ledger_replays (created_at desc);

comment on table public.erasure_ledger_replays is
  'One row per post-restore erasure replay: the ledger read from the object backup, how many tombstones the restore rolled back, and who ran it. Read by the restore drill; never by a tenant.';

comment on column public.erasure_ledger_replays.re_armed is
  'Subjects the restore resurrected: present in the ledger, absent from the restored tombstone table. Non-zero means the database must not serve traffic until the purge cron has re-erased them.';

-- 0037 hands every new table full DML through ALTER DEFAULT PRIVILEGES, and a
-- record of which accounts were erased is not tenant-readable at all.
revoke all on public.erasure_ledger_replays from app_rls;

alter table public.erasure_ledger_replays enable row level security;
alter table public.erasure_ledger_replays force row level security;

commit;
