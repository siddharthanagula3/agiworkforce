-- =============================================================================
-- Migration 0348: the workspace switch that turns product analytics off
--
-- Why    : product usage events are recorded per account only with the
--          member's own product_analytics consent. A workspace administrator
--          needs to be able to say no for every member, the way Claude and
--          ChatGPT workspaces let an admin restrict what is collected, without
--          being able to say yes on a member's behalf.
--
-- Shape  : the answer lives on organization_admin_policies.metadata under
--          allowProductAnalytics, beside the other boolean workspace switches
--          the admin policy writes through metadata. Absent or true means each
--          member's own consent decides; false means nothing is recorded for
--          any member. This constraint keeps the stored value a boolean, so a
--          string "false" cannot read one way in SQL and another in the gate.
--
-- Empty  : no row sets the key until an administrator turns the switch off, so
--          applying this changes no decision.
--
-- Depends: 0076 (organization_admin_policies.metadata)
-- =============================================================================

begin;

alter table public.organization_admin_policies
  drop constraint if exists organization_admin_policies_product_analytics_boolean;

alter table public.organization_admin_policies
  add constraint organization_admin_policies_product_analytics_boolean
  check (
    not (metadata ? 'allowProductAnalytics')
    or jsonb_typeof(metadata -> 'allowProductAnalytics') = 'boolean'
  );

comment on constraint organization_admin_policies_product_analytics_boolean
  on public.organization_admin_policies is
  'allowProductAnalytics is a boolean or absent. Absent or true leaves product analytics to each member''s consent; false records no product analytics for any member of the workspace.';

commit;
