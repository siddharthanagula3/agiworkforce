-- Reversal of 0336: forget workspace site rules for web search and fetching.
--
-- WHAT THIS COSTS: every saved allowed and blocked site is destroyed, and web
-- search and page fetching can again read any public site for every member.
-- Export the two columns first if any workspace has set them.

begin;

alter table public.organization_connector_policies
  drop constraint if exists web_domain_lists_bounded;

alter table public.organization_connector_policies
  drop column if exists blocked_web_domains,
  drop column if exists allowed_web_domains;

delete from public.schema_migrations
 where filename = '0336_workspace_web_domain_policy.sql';

commit;
