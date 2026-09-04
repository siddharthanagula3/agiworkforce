-- 0162 : the workspace decommission grace window.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Verification found that no route deletes an organization: settings/organization
-- exposes GET, POST and PATCH only, and leaveOrganization refuses to let a sole
-- owner leave, with nowhere else to send them. An enterprise workspace could not
-- be decommissioned by its owner or by an operator, which fails the retention
-- and deletion control an enterprise customer expects.
--
-- Same shape as 0071/0108 (profiles.deletion_requested_at /
-- deletion_scheduled_for): a nullable schedule that DELETE /api/settings/organization
-- sets and POST .../deletion/cancel clears, consumed by
-- GET /api/cron/purge-deleted-organizations once the grace window has passed.
-- deletion_requested_by records the owner who asked, matching organizations.created_by's
-- existing shape of an unconstrained Clerk user id column.

alter table public.organizations
  add column if not exists deletion_requested_at timestamptz;

alter table public.organizations
  add column if not exists deletion_scheduled_for timestamptz;

alter table public.organizations
  add column if not exists deletion_requested_by text;

-- Partial index: the purge cron scans only workspaces actually scheduled,
-- which is a vanishing fraction of the table.
create index if not exists idx_organizations_deletion_scheduled_for
  on public.organizations (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

comment on column public.organizations.deletion_requested_at is
  'When the workspace owner requested deletion. Informational; the schedule is deletion_scheduled_for.';
comment on column public.organizations.deletion_scheduled_for is
  'When the grace window closes. /api/cron/purge-deleted-organizations erases the workspace once this has passed.';
comment on column public.organizations.deletion_requested_by is
  'The owner user id that requested deletion, for the audit trail.';
