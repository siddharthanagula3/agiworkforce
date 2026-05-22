-- Migration: cloud_managed_waitlist
-- Created: 2026-05-22
-- Purpose: Persist Cloud Managed private beta waitlist signups.
--   Used by POST /api/waitlist/cloud-managed.
--   Idempotent on (email, source).

create table if not exists cloud_managed_waitlist (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null,
  source      text        not null default 'other'
                          check (source in ('byok', 'sync', 'billing', 'other')),
  joined_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint cloud_managed_waitlist_email_source_unique unique (email, source)
);

-- No auth.uid() dependency — unauthenticated signups.
-- RLS: insert open, select/update/delete locked to service role.
alter table cloud_managed_waitlist enable row level security;

create policy "Anyone can join waitlist"
  on cloud_managed_waitlist
  for insert
  with check (true);

create policy "Service role reads waitlist"
  on cloud_managed_waitlist
  for select
  using (auth.role() = 'service_role');

comment on table cloud_managed_waitlist is
  'Cloud Managed private beta waitlist signups. Insert-open; read locked to service role.';
