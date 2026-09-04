-- Reversal of 0162 — remove the workspace decommission grace window.
--
-- Any organization currently scheduled for deletion loses its schedule
-- silently: the columns holding it are dropped. Confirm nothing is pending
-- (select count(*) from public.organizations where deletion_scheduled_for is
-- not null) before running this in an environment that matters.

begin;

drop index if exists public.idx_organizations_deletion_scheduled_for;

alter table public.organizations
  drop column if exists deletion_requested_by;

alter table public.organizations
  drop column if exists deletion_scheduled_for;

alter table public.organizations
  drop column if exists deletion_requested_at;

delete from public.schema_migrations
 where filename = '0162_organization_deletion.sql';

commit;
