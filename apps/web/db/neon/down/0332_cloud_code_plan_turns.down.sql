-- Reversal of 0332 : Code turns lose their mode, and every turn runs as an
-- agent turn.
--
-- WHAT THIS COSTS: which past turns were plan turns is lost. A plan turn still
-- waiting for an approval would resume as an agent turn that may edit files,
-- so its pending approvals expire first. Agent turns are untouched.

begin;

update public.cloud_code_agent_approvals
   set state = 'expired', decided_at = now()
 where state = 'pending'
   and turn_id in (select id from public.cloud_code_agent_turns where mode = 'plan');

alter table public.cloud_code_agent_turns
  drop constraint if exists cloud_code_agent_turns_mode_check,
  drop column if exists mode;

delete from public.schema_migrations
 where filename = '0332_cloud_code_plan_turns.sql';

commit;
