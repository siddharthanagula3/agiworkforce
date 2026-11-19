-- =============================================================================
-- Migration 0408: freeze each evaluation run's cases and the expectation graded
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : a run counted its cases at admission but graded each result against
--          the case as it was edited at the moment the result arrived, so an
--          edit between the two checked an old output against a new
--          expectation, and nothing recorded which cases the run was admitted
--          with or what each verdict was measured against.
--
-- Shape  : developer_eval_run_cases holds one row per case the run was
--          admitted with: its variables and expected output as they were at
--          admission, written in the transaction that creates the run and
--          never changed. A result is accepted only for a case in that set and
--          is graded against its frozen expected output. The case id has no
--          foreign key, so the row outlives a deleted or edited case.
--          developer_eval_results gains a nullable expected_output holding the
--          expectation its verdict was measured against, so a reopened run
--          shows it even after the case is edited or deleted.
--
-- Empty  : runs admitted before this migration have no rows here and keep a
--          null expected_output on their results. Their results are still
--          recorded and graded against the current case as before.
--
-- Depends: 0371 (developer_eval_runs, developer_eval_results), 0037
--          (profiles, current_app_user_id)
-- =============================================================================

begin;

create table if not exists public.developer_eval_run_cases (
  run_id uuid not null references public.developer_eval_runs(id) on delete cascade,
  case_id uuid not null,
  user_id text not null references public.profiles(id) on delete cascade,
  position integer not null,
  variables jsonb not null check (jsonb_typeof(variables) = 'object'),
  expected_output text check (expected_output is null or char_length(expected_output) <= 32000),
  created_at timestamptz not null default now(),
  primary key (run_id, case_id)
);

alter table public.developer_eval_results
  add column if not exists expected_output text
    constraint developer_eval_results_expected_output_length
    check (expected_output is null or char_length(expected_output) <= 32000);

revoke all on public.developer_eval_run_cases from public, app_rls;
grant select, insert on public.developer_eval_run_cases to app_rls;
alter table public.developer_eval_run_cases enable row level security;
alter table public.developer_eval_run_cases force row level security;
drop policy if exists developer_eval_run_cases_owner on public.developer_eval_run_cases;
create policy developer_eval_run_cases_owner
  on public.developer_eval_run_cases for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and exists (
      select 1 from public.developer_eval_runs run
       where run.id = developer_eval_run_cases.run_id
         and run.user_id = (select public.current_app_user_id())
    )
  );

comment on table public.developer_eval_run_cases is
  'The cases an evaluation run was admitted with, frozen with the expected output each result is graded against.';
comment on column public.developer_eval_results.expected_output is
  'The expected output this result was graded against, frozen at run admission. Null for runs admitted before it was kept.';

commit;
