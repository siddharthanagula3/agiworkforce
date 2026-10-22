-- =============================================================================
-- Migration 0387: website rules per agent
--
-- Why    : a workspace could limit the sites web search and page fetching
--          read (0336), and a chat request could narrow them further, but an
--          agent could not. Claude's web search and web fetch tools take
--          allowed_domains and blocked_domains per tool configuration, so an
--          agent built for one source of truth had to trust its instructions
--          instead of a rule the server enforces.
--
-- Shape  : Two domain lists on user_agents. A domain entry covers the domain
--          and every subdomain. A chat with the agent may read only what the
--          workspace, the agent and the request all allow; a blocked domain
--          on any of the three is never read. The lists only narrow: an
--          agent's allow list never reopens a site the workspace blocked.
--
-- Empty  : AN EMPTY ALLOWLIST MEANS UNRESTRICTED, NOT DENY-ALL, as in 0336.
--          Existing agents gain empty lists and keep their current behaviour.
--          Published versions in user_agent_versions carry their config as
--          JSON; one published before this migration reads as empty lists.
--
-- Depends: 0370 (user_agents)
-- =============================================================================

begin;

alter table public.user_agents
  add column if not exists allowed_web_domains text[] not null default array[]::text[],
  add column if not exists blocked_web_domains text[] not null default array[]::text[];

alter table public.user_agents
  drop constraint if exists user_agents_web_domain_lists_bounded;
alter table public.user_agents
  add constraint user_agents_web_domain_lists_bounded check (
    cardinality(allowed_web_domains) <= 32
    and cardinality(blocked_web_domains) <= 32
  );

comment on column public.user_agents.allowed_web_domains is
  'Domains this agent''s web search and page fetching may read. Empty means no narrowing.';
comment on column public.user_agents.blocked_web_domains is
  'Domains this agent''s web search and page fetching never read. A block wins over an allow.';

commit;
