-- 0224 : research reports become a retention domain of their own.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0205 gave each data domain its own window, but research was not one of them.
-- A report's only retention was the cascade from web_conversations (0094), so a
-- report saved from a conversation that was later deleted went with it, while a
-- report kept on its own, which is how the reports gallery lists them, was kept
-- forever whatever window the workspace had set. A workspace that deletes work
-- runs after 30 days was still holding the research those runs produced.
--
-- The sweeper matches the other member-scoped domains: it deletes reports
-- belonging to members of the workspace, never touches a member under a legal
-- hold, and cuts on created_at rather than completed_at so a run that never
-- finished is covered by the same window as one that did.
--
-- No new table and no new column: this widens the two domain check constraints
-- so 'research' is an accepted value for a policy and for a sweep record.

begin;

alter table public.organization_domain_retention_policies
  drop constraint if exists organization_domain_retention_policies_domain_check;

alter table public.organization_domain_retention_policies
  add constraint organization_domain_retention_policies_domain_check check (domain in (
    'projects', 'work', 'code_sessions', 'files', 'artifacts',
    'connector_data', 'remote_sessions', 'notifications', 'research'
  ));

alter table public.organization_domain_retention_sweeps
  drop constraint if exists organization_domain_retention_sweeps_domain_check;

alter table public.organization_domain_retention_sweeps
  add constraint organization_domain_retention_sweeps_domain_check check (domain in (
    'projects', 'work', 'code_sessions', 'files', 'artifacts',
    'connector_data', 'remote_sessions', 'notifications', 'research'
  ));

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. A research policy is accepted:
-- --    INSERT INTO public.organization_domain_retention_policies
-- --      (organization_id, domain, retention_days)
-- --    VALUES ('<an existing organizations.id>', 'research', 30);
-- --    EXPECT: INSERT 0 1
--
-- -- 2. An unknown domain is still refused:
-- --    INSERT INTO public.organization_domain_retention_policies
-- --      (organization_id, domain, retention_days)
-- --    VALUES ('<the same organizations.id>', 'nonsense', 30);
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 3. Clean up:
-- --    DELETE FROM public.organization_domain_retention_policies
-- --     WHERE domain = 'research';
-- =============================================================================
