-- =============================================================================
-- Migration 0385: which tools AGI may use in a Slack channel
--
-- Why    : the installer could choose whether AGI answers or runs tasks in a
--          channel, but not which tools it may reach there.
--
-- Shape  : slack_channel_policies.allowed_tools lists the tool groups a
--          channel allows: web (search and read pages), code (run code) and
--          apps (connected apps and integrations). Null keeps every group, the
--          behaviour before this migration, so no existing channel changes. The
--          0374 policies already let only the installer write the row.
--
-- Depends: 0374_slack_channel_policy_and_agent_credit_cap
-- =============================================================================

begin;

alter table public.slack_channel_policies
  add column if not exists allowed_tools text[];

alter table public.slack_channel_policies
  drop constraint if exists slack_channel_policies_allowed_tools_check;

alter table public.slack_channel_policies
  add constraint slack_channel_policies_allowed_tools_check
  check (
    allowed_tools is null
    or allowed_tools <@ array['web', 'code', 'apps']::text[]
  );

comment on column public.slack_channel_policies.allowed_tools is
  'Tool groups AGI may use in this channel (web, code, apps). Null allows every group.';

commit;

-- =============================================================================
-- VERIFICATION -- run MANUALLY on a throwaway branch before production.
-- =============================================================================
-- -- 1. No channel is restricted by this migration alone:
-- --    select count(*) from public.slack_channel_policies where allowed_tools is not null;
-- --                                                                -- EXPECT: 0
-- -- 2. An unknown group is refused:
-- --    update public.slack_channel_policies set allowed_tools = array['shell'];
-- --                                                                -- EXPECT: check violation
-- =============================================================================
