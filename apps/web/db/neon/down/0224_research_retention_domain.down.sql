-- Reversal of 0224, drop research from the retention domains.
--
-- Any policy or sweep record naming 'research' is deleted first, because the
-- narrowed check constraint cannot be added while a row violates it. A
-- workspace that had set a research window loses that setting and its reports
-- go back to being kept until their conversation is deleted.

begin;

delete from public.organization_domain_retention_sweeps where domain = 'research';
delete from public.organization_domain_retention_policies where domain = 'research';

alter table public.organization_domain_retention_policies
  drop constraint if exists organization_domain_retention_policies_domain_check;

alter table public.organization_domain_retention_policies
  add constraint organization_domain_retention_policies_domain_check check (domain in (
    'projects', 'work', 'code_sessions', 'files', 'artifacts',
    'connector_data', 'remote_sessions', 'notifications'
  ));

alter table public.organization_domain_retention_sweeps
  drop constraint if exists organization_domain_retention_sweeps_domain_check;

alter table public.organization_domain_retention_sweeps
  add constraint organization_domain_retention_sweeps_domain_check check (domain in (
    'projects', 'work', 'code_sessions', 'files', 'artifacts',
    'connector_data', 'remote_sessions', 'notifications'
  ));

delete from public.schema_migrations
 where filename = '0224_research_retention_domain.sql';

commit;
