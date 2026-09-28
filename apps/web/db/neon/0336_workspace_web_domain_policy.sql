-- =============================================================================
-- Migration 0336: workspace site rules for web search and page fetching
--
-- Why    : an administrator could decide which connectors, plugins and MCP
--          hosts members reach, but not which websites the assistant reads.
--          Web search and url_fetch reached any public site for every member.
--          Claude's Console lets administrators restrict the domains web
--          search uses, and ChatGPT Enterprise blocks sites for its agent's
--          browsing, so a workspace needs the same control.
--
-- Shape  : Two domain lists on the workspace's connector policy row. A domain
--          entry covers the domain and every subdomain. When the allow list is
--          non-empty nothing outside it is read; a blocked domain is refused
--          even when an allowed entry covers it.
--
-- Empty  : AN EMPTY ALLOWLIST MEANS UNRESTRICTED, NOT DENY-ALL, as in 0141.
--          Existing rows gain empty lists and keep their current behaviour.
--
-- Depends: 0141 (organization_connector_policies), 0144 (governance writes),
--          0198 (list bounds)
-- =============================================================================

begin;

alter table public.organization_connector_policies
  add column if not exists allowed_web_domains text[] not null default array[]::text[],
  add column if not exists blocked_web_domains text[] not null default array[]::text[];

alter table public.organization_connector_policies
  drop constraint if exists web_domain_lists_bounded;
alter table public.organization_connector_policies
  add constraint web_domain_lists_bounded check (
    cardinality(allowed_web_domains) <= 512
    and cardinality(blocked_web_domains) <= 512
  );

comment on column public.organization_connector_policies.allowed_web_domains is
  'Domains web search and page fetching may read for every member. Empty means unrestricted.';
comment on column public.organization_connector_policies.blocked_web_domains is
  'Domains web search and page fetching never read. A block wins over an allow.';

commit;
