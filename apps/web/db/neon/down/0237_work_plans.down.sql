-- Reversal of 0237, remove durable Work plans.
--
-- COST, read this before running it: this drops every plan, every step and the
-- whole revision history. A run that was executing against a durable plan keeps
-- running, because the tool loop still streams its own in-message step list, but
-- the objective it was accountable to, the dependency graph and the record of
-- who changed the plan are gone and cannot be reconstructed from the chat.
-- Export work_plans, work_plan_steps and work_plan_revisions first if any plan
-- has ever left draft.

begin;

drop policy if exists work_plan_revisions_user_isolation on public.work_plan_revisions;
drop policy if exists work_plan_steps_user_isolation on public.work_plan_steps;
drop policy if exists work_plans_user_isolation on public.work_plans;

alter table public.work_plan_revisions disable row level security;
alter table public.work_plan_steps disable row level security;
alter table public.work_plans disable row level security;

drop trigger if exists set_work_plan_steps_updated_at on public.work_plan_steps;
drop trigger if exists set_work_plans_updated_at on public.work_plans;

drop index if exists public.work_plan_steps_plan_order_idx;
drop index if exists public.work_plans_user_updated_idx;
drop index if exists public.work_plans_one_per_run_idx;

drop table if exists public.work_plan_revisions;
drop table if exists public.work_plan_steps;
drop table if exists public.work_plans;

delete from public.schema_migrations
 where filename = '0237_work_plans.sql';

commit;
