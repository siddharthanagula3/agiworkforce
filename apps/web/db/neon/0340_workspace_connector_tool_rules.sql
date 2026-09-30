-- =============================================================================
-- Migration 0340: workspace rules for individual connector tools
--
-- Why    : an administrator could approve or block a whole connector, but not
--          decide what its tools may do. Claude's organization connector
--          settings set each permission category or individual permission to
--          Always allow, Needs approval or Blocked for everyone, so a
--          workspace needs the same control over its members' connector tools.
--
-- Shape  : One JSON array on the workspace's connector policy row. Each entry
--          is {connectorId, toolName, level}, where toolName is a tool or a
--          category (*read_only, *write) and level is allow, ask or deny. A
--          rule is never looser than the member's own verdict.
--
-- Empty  : An empty array means no workspace tool rules. Existing rows gain an
--          empty array and keep their current behaviour.
--
-- Depends: 0141 (organization_connector_policies), 0144 (governance writes)
-- =============================================================================

begin;

alter table public.organization_connector_policies
  add column if not exists tool_rules jsonb not null default '[]'::jsonb;

alter table public.organization_connector_policies
  drop constraint if exists tool_rules_bounded;
alter table public.organization_connector_policies
  add constraint tool_rules_bounded check (
    jsonb_typeof(tool_rules) = 'array'
    and jsonb_array_length(tool_rules) <= 512
  );

comment on column public.organization_connector_policies.tool_rules is
  'Workspace verdicts on connector tools: [{connectorId, toolName, level}], level allow, ask or deny. Empty means none.';

commit;
