-- 0205 : retention windows set per data domain, and the record of each sweep.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0138 governs one thing: workspace conversations. Projects, Work runs, Code
-- sessions, files, artifacts, connector records, remote device pairings and
-- notifications had no window at all, so a workspace that promised a retention
-- period kept everything else forever. Each domain now carries its own window
-- and its own switch, because the legal and operational reasons to keep a
-- Code session are not the reasons to keep a notification.
--
-- Written only by the service role after the route has checked policy.manage.
-- Members with audit.read may read both tables, which is what the console and
-- an auditor need to see what was deleted and when. As with 0138, nobody can
-- edit the sweep record through the application role.

begin;

create table if not exists public.organization_domain_retention_policies (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (domain in (
    'projects', 'work', 'code_sessions', 'files', 'artifacts',
    'connector_data', 'remote_sessions', 'notifications'
  )),
  retention_days integer not null check (retention_days between 1 and 3650),
  enforced boolean not null default false,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, domain)
);

create table if not exists public.organization_domain_retention_sweeps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (domain in (
    'projects', 'work', 'code_sessions', 'files', 'artifacts',
    'connector_data', 'remote_sessions', 'notifications'
  )),
  retention_days integer not null check (retention_days between 1 and 3650),
  cutoff timestamptz not null,
  outcome text not null check (outcome in ('deleted', 'nothing_due', 'held', 'aborted', 'failed')),
  records_deleted integer not null default 0 check (records_deleted >= 0),
  records_held integer not null default 0 check (records_held >= 0),
  objects_deleted integer not null default 0 check (objects_deleted >= 0),
  objects_failed integer not null default 0 check (objects_failed >= 0),
  active_holds integer not null default 0 check (active_holds >= 0),
  error text check (error is null or char_length(error) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_domain_retention_sweeps_org_created
  on public.organization_domain_retention_sweeps (organization_id, created_at desc);
create index if not exists idx_domain_retention_sweeps_org_domain_created
  on public.organization_domain_retention_sweeps (organization_id, domain, created_at desc);
create index if not exists idx_domain_retention_policies_enforced
  on public.organization_domain_retention_policies (domain)
  where enforced;

drop trigger if exists set_domain_retention_policies_updated_at
  on public.organization_domain_retention_policies;
create trigger set_domain_retention_policies_updated_at
  before update on public.organization_domain_retention_policies
  for each row execute function public.set_row_updated_at();

grant select on public.organization_domain_retention_policies to app_rls;
grant select on public.organization_domain_retention_sweeps to app_rls;

alter table public.organization_domain_retention_policies enable row level security;
alter table public.organization_domain_retention_policies force row level security;
alter table public.organization_domain_retention_sweeps enable row level security;
alter table public.organization_domain_retention_sweeps force row level security;

drop policy if exists domain_retention_policies_audit_read
  on public.organization_domain_retention_policies;
create policy domain_retention_policies_audit_read
  on public.organization_domain_retention_policies for select to app_rls
  using (public.app_has_org_permission(organization_id, 'audit.read'));

drop policy if exists domain_retention_sweeps_audit_read
  on public.organization_domain_retention_sweeps;
create policy domain_retention_sweeps_audit_read
  on public.organization_domain_retention_sweeps for select to app_rls
  using (public.app_has_org_permission(organization_id, 'audit.read'));

commit;
