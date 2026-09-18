-- 0237 : a Work plan is a durable object the user can revise, not a list in a message.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Today an AGI Work turn asks the model for three to six step strings and keeps
-- them in the assistant message's metadata. Nothing outside that turn can read
-- the plan, nothing can change it once the turn is streaming, and a step that
-- has to wait for another step has no way to say so: `advanceAgiWorkPlan` only
-- walks the array in order. A run that is resumed a day later cannot show what
-- it set out to do, because the objective lives in the same message.
--
-- The three tables here make the plan a first-class object:
--
--   work_plans          the objective the run is accountable to, and the
--                       version every reader quotes. `run_id` ties it to the
--                       durable run so a resumed run finds its own plan.
--   work_plan_steps     the steps, each with a stable id that survives a
--                       revision, an explicit order, and `depends_on`, so
--                       "step 4 needs step 2" is a fact rather than a
--                       convention about array order. The order is unique per
--                       plan but DEFERRABLE, because a reorder necessarily
--                       passes through a state where two steps hold one
--                       position; without the deferral every reorder would have
--                       to be written as a delete and a re-insert, which would
--                       lose each step's status.
--   work_plan_revisions one append-only row per version, carrying the
--                       operations that produced it and the snapshot they
--                       produced, so "the plan changed mid-task" is answerable
--                       after the fact and by whom.
--
-- Nothing reads the old in-message list through these tables, so in-flight runs
-- and their approval checkpoints are unaffected by this migration: a run that
-- started before it keeps streaming its flat list, and a run that starts after
-- it gets a durable plan as well.

begin;

create table if not exists public.work_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  run_id uuid,
  conversation_id uuid references public.web_conversations(id) on delete set null,
  objective text not null,
  constraints text,
  deliverable text,
  version bigint not null default 1,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_plans_id_is_user_owned unique (id, user_id),
  constraint work_plans_objective_is_stated check (
    length(btrim(objective)) between 1 and 2000
  ),
  constraint work_plans_fields_are_bounded check (
    (constraints is null or length(constraints) <= 1000)
    and (deliverable is null or length(deliverable) <= 1000)
  ),
  constraint work_plans_version_counts_up check (version > 0),
  constraint work_plans_status_is_known check (
    status in ('draft', 'active', 'completed', 'failed', 'cancelled')
  ),
  constraint work_plans_run_is_owned foreign key (run_id, user_id)
    references public.cloud_agent_runs(id, user_id) on delete cascade
);

create unique index if not exists work_plans_one_per_run_idx
  on public.work_plans(run_id)
  where run_id is not null;

create index if not exists work_plans_user_updated_idx
  on public.work_plans(user_id, updated_at desc);

comment on table public.work_plans is
  'The durable plan one Work task is executing: its objective, its version, and the run it belongs to.';
comment on column public.work_plans.version is
  'Bumped by every accepted revision. A reader that acts on a plan quotes the version it read, so a revision that lands first is not silently overwritten.';

create table if not exists public.work_plan_steps (
  plan_id uuid not null,
  user_id text not null,
  step_id text not null,
  step_order integer not null,
  description text not null,
  status text not null default 'pending',
  depends_on text[] not null default '{}',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, step_id),
  constraint work_plan_steps_id_is_bounded check (length(step_id) between 1 and 64),
  constraint work_plan_steps_order_counts_up check (step_order >= 0),
  constraint work_plan_steps_description_is_stated check (
    length(btrim(description)) between 1 and 300
  ),
  constraint work_plan_steps_status_is_known check (
    status in ('pending', 'in_progress', 'completed', 'failed', 'cancelled')
  ),
  constraint work_plan_steps_dependencies_are_bounded check (
    coalesce(array_length(depends_on, 1), 0) <= 16
  ),
  constraint work_plan_steps_never_depend_on_themselves check (not (step_id = any (depends_on))),
  constraint work_plan_steps_order_is_unique unique (plan_id, step_order)
    deferrable initially deferred,
  constraint work_plan_steps_plan_is_owned foreign key (plan_id, user_id)
    references public.work_plans(id, user_id) on delete cascade
);

create index if not exists work_plan_steps_plan_order_idx
  on public.work_plan_steps(plan_id, step_order asc);

comment on table public.work_plan_steps is
  'One step of a durable Work plan. step_id survives reordering and revision; depends_on names the steps that must finish first.';

create table if not exists public.work_plan_revisions (
  id bigint generated always as identity primary key,
  plan_id uuid not null,
  user_id text not null,
  version bigint not null,
  revised_by text not null,
  operations jsonb not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint work_plan_revisions_version_is_unique unique (plan_id, version),
  constraint work_plan_revisions_version_counts_up check (version > 0),
  constraint work_plan_revisions_author_is_known check (
    revised_by in ('agent', 'user', 'system')
  ),
  constraint work_plan_revisions_operations_are_a_list check (
    jsonb_typeof(operations) = 'array' and jsonb_array_length(operations) between 1 and 64
  ),
  constraint work_plan_revisions_snapshot_is_an_object check (jsonb_typeof(snapshot) = 'object'),
  constraint work_plan_revisions_plan_is_owned foreign key (plan_id, user_id)
    references public.work_plans(id, user_id) on delete cascade
);

comment on table public.work_plan_revisions is
  'Append-only history of a Work plan: one row per version, carrying the operations that produced it and who asked for them.';

drop trigger if exists set_work_plans_updated_at on public.work_plans;
create trigger set_work_plans_updated_at
  before update on public.work_plans
  for each row execute function public.set_row_updated_at();

drop trigger if exists set_work_plan_steps_updated_at on public.work_plan_steps;
create trigger set_work_plan_steps_updated_at
  before update on public.work_plan_steps
  for each row execute function public.set_row_updated_at();

revoke all on public.work_plans from public;
revoke all on public.work_plan_steps from public;
revoke all on public.work_plan_revisions from public;
grant select, insert, update on public.work_plans to app_rls;
grant select, insert, update, delete on public.work_plan_steps to app_rls;
grant select, insert on public.work_plan_revisions to app_rls;

alter table public.work_plans enable row level security;
alter table public.work_plans force row level security;
alter table public.work_plan_steps enable row level security;
alter table public.work_plan_steps force row level security;
alter table public.work_plan_revisions enable row level security;
alter table public.work_plan_revisions force row level security;

drop policy if exists work_plans_user_isolation on public.work_plans;
create policy work_plans_user_isolation
  on public.work_plans
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

drop policy if exists work_plan_steps_user_isolation on public.work_plan_steps;
create policy work_plan_steps_user_isolation
  on public.work_plan_steps
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

drop policy if exists work_plan_revisions_user_isolation on public.work_plan_revisions;
create policy work_plan_revisions_user_isolation
  on public.work_plan_revisions
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. A plan needs an objective:
-- --    INSERT INTO public.work_plans (user_id, objective) VALUES ('u', '   ');
-- --    EXPECT: ERROR violates check constraint work_plans_objective_is_stated
--
-- -- 2. A plan with an objective is accepted and starts at version 1:
-- --    INSERT INTO public.work_plans (user_id, objective)
-- --    VALUES ('u', 'Ship the pricing page') RETURNING id, version, status;
-- --    EXPECT: one row, version 1, status draft
--
-- -- 3. A step cannot depend on itself:
-- --    INSERT INTO public.work_plan_steps
-- --      (plan_id, user_id, step_id, step_order, description, depends_on)
-- --    VALUES ('<id from 2>', 'u', 's1', 0, 'Draft copy', '{s1}');
-- --    EXPECT: ERROR violates check constraint work_plan_steps_never_depend_on_themselves
--
-- -- 4. Two steps, then a reorder inside one transaction:
-- --    INSERT INTO public.work_plan_steps
-- --      (plan_id, user_id, step_id, step_order, description)
-- --    VALUES ('<id>', 'u', 's1', 0, 'Draft copy'), ('<id>', 'u', 's2', 1, 'Review copy');
-- --    BEGIN;
-- --      UPDATE public.work_plan_steps SET step_order = 1 WHERE plan_id = '<id>' AND step_id = 's1';
-- --      UPDATE public.work_plan_steps SET step_order = 0 WHERE plan_id = '<id>' AND step_id = 's2';
-- --    COMMIT;
-- --    EXPECT: COMMIT (the unique order is deferred to commit)
--
-- -- 5. One plan per run:
-- --    INSERT INTO public.work_plans (user_id, objective, run_id)
-- --    VALUES ('u', 'A', '<an existing cloud_agent_runs.id for u>'),
-- --           ('u', 'B', '<the same run id>');
-- --    EXPECT: ERROR duplicate key value violates unique index work_plans_one_per_run_idx
--
-- -- 6. Clean up:
-- --    DELETE FROM public.work_plans WHERE user_id = 'u';
-- =============================================================================
