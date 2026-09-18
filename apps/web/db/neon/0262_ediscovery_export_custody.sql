-- =============================================================================
-- Migration 0262: chain of custody for eDiscovery exports
--
-- Why    : an export of held records left one trace, an enterprise_audit_events
--          row saying that somebody exported a hold. That answers "who" and
--          "when" and nothing else. An opposing party asks what the file
--          contained, whether it is the whole set, and whether it has been
--          altered since it left the system; a line in a general audit log
--          cannot answer any of the three, and an export nobody can vouch for
--          is an export a court can discount.
--
-- Shape  : one row per export attempt, carrying the filter that produced it,
--          the manifest of what came out (per resource type: record count,
--          byte count, sha-256), and a hash chain over the whole row.
--
--          `hold_id` carries no foreign key on purpose: the custody record has
--          to outlive the hold it exported, which is exactly the hold a
--          workspace deletion would otherwise take the evidence with. The
--          organization reference does cascade, because a decommissioned tenant
--          keeps nothing, and its own audit trail is detached rather than
--          destroyed by organization-erasure.ts.
--
-- Chain  : previous_hash / entry_hash per organization, the same construction
--          0229 uses for the break-glass trail. Editing any field of any row in
--          place breaks every link after it, which is the only claim a hash
--          chain makes and the one that matters here.
--
-- Failed : a failed export is recorded too. An export that died halfway
--          produced bytes somebody may hold, and a custody log that only lists
--          successes cannot account for them.
--
-- Depends: 0073_tenancy_foundation (organizations)
--          0138_retention_enforcement_and_legal_hold (legal_holds)
-- =============================================================================

begin;

create table if not exists public.ediscovery_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  hold_id uuid,
  hold_name text not null,
  requested_by_user_id text not null,
  requested_via text not null,
  filter jsonb not null default '{}'::jsonb,
  manifest jsonb not null default '{}'::jsonb,
  record_count integer not null default 0 check (record_count >= 0),
  byte_count bigint not null default 0 check (byte_count >= 0),
  content_digest text not null,
  outcome text not null check (outcome in ('completed', 'failed')),
  error text,
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  previous_hash text not null,
  entry_hash text not null,
  constraint ediscovery_exports_failure_has_reason check (
    outcome <> 'failed' or error is not null
  )
);

create index if not exists idx_ediscovery_exports_org_completed
  on public.ediscovery_exports (organization_id, completed_at desc);

create index if not exists idx_ediscovery_exports_hold
  on public.ediscovery_exports (hold_id, completed_at desc);

comment on table public.ediscovery_exports is
  'Chain of custody for eDiscovery exports: who exported which hold, under which filter, what came out (manifest with per-resource sha-256), and a per-organization hash chain over the record. Append-only for every role.';

create or replace function public.ediscovery_exports_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'ediscovery_exports is append-only: % is refused. Correct the record by appending, never by rewriting.',
    tg_op;
end;
$$;

comment on function public.ediscovery_exports_are_append_only() is
  'Refuses UPDATE and DELETE on the eDiscovery custody trail for every role, including the owner connection the export route holds.';

drop trigger if exists ediscovery_exports_append_only on public.ediscovery_exports;
create trigger ediscovery_exports_append_only
  before update or delete on public.ediscovery_exports
  for each row execute function public.ediscovery_exports_are_append_only();

-- 0037 hands every new table full DML through ALTER DEFAULT PRIVILEGES, so the
-- REVOKE comes first, exactly as 0229 had to.
revoke insert, update, delete on public.ediscovery_exports from app_rls;
grant select on public.ediscovery_exports to app_rls;

alter table public.ediscovery_exports enable row level security;
alter table public.ediscovery_exports force row level security;

drop policy if exists ediscovery_exports_admin_read on public.ediscovery_exports;
create policy ediscovery_exports_admin_read
  on public.ediscovery_exports
  for select to app_rls
  using (
    exists (
      select 1 from public.organization_members m
       where m.organization_id = ediscovery_exports.organization_id
         and m.user_id = public.current_app_user_id()
         and m.role in ('owner', 'admin')
    )
  );

commit;
