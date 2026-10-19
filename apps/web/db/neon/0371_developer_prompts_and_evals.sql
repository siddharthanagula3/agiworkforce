-- =============================================================================
-- Migration 0371: prompts, versions and evaluations in the developer console
--
-- Why    : the developer console could send one request and nothing more. The
--          Claude Console Workbench keeps prompts as templates with versions,
--          test cases entered by hand or from a CSV, a run of every case in one
--          click, and a grade for each response; OpenAI's prompt and eval
--          dashboards covered the same ground until their shutdown. A developer
--          here had nowhere to keep a prompt, compare two versions of it, or
--          check a change against known cases.
--
-- Shape  : developer_prompts is one named prompt. developer_prompt_versions
--          is append-only: each save is the next number, holding the system
--          prompt, a template with {{variable}} slots, the model and its
--          parameters, so versions can be compared and an old one saved again
--          as the newest. developer_eval_cases are a prompt's test cases: the
--          values for its variables and an optional expected output.
--          developer_eval_runs run one version over the cases, and
--          developer_eval_results hold each case's output, latency, tokens,
--          the automatic check against the expected output and an optional
--          1 to 5 grade. The cases run through the account's own gateway calls
--          from the console, so a run costs what those calls cost. Everything
--          belongs to one account; no row is shared.
--
-- Depends: 0037 (profiles, current_app_user_id), 0076 (set_row_updated_at)
-- =============================================================================

begin;

create table if not exists public.developer_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists developer_prompts_owner_idx
  on public.developer_prompts (user_id, updated_at desc);

drop trigger if exists set_developer_prompts_updated_at on public.developer_prompts;
create trigger set_developer_prompts_updated_at
  before update on public.developer_prompts
  for each row execute function public.set_row_updated_at();

create table if not exists public.developer_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.developer_prompts(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  version integer not null check (version >= 1),
  system_prompt text not null default '' check (char_length(system_prompt) <= 32000),
  template text not null check (char_length(template) between 1 and 32000),
  model text not null check (char_length(model) between 1 and 200),
  max_tokens integer check (max_tokens is null or max_tokens between 1 and 200000),
  temperature numeric(3, 2) check (temperature is null or temperature between 0 and 2),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  constraint developer_prompt_versions_number_unique unique (prompt_id, version)
);

create table if not exists public.developer_eval_cases (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.developer_prompts(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  variables jsonb not null default '{}'::jsonb check (jsonb_typeof(variables) = 'object'),
  expected_output text check (expected_output is null or char_length(expected_output) <= 32000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists developer_eval_cases_prompt_idx
  on public.developer_eval_cases (prompt_id, position, created_at);

drop trigger if exists set_developer_eval_cases_updated_at on public.developer_eval_cases;
create trigger set_developer_eval_cases_updated_at
  before update on public.developer_eval_cases
  for each row execute function public.set_row_updated_at();

create table if not exists public.developer_eval_runs (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.developer_prompts(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  version integer not null check (version >= 1),
  check_kind text not null check (check_kind in ('exact', 'contains', 'none')),
  case_count integer not null check (case_count between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists developer_eval_runs_prompt_idx
  on public.developer_eval_runs (prompt_id, created_at desc);

create table if not exists public.developer_eval_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.developer_eval_runs(id) on delete cascade,
  case_id uuid references public.developer_eval_cases(id) on delete set null,
  user_id text not null references public.profiles(id) on delete cascade,
  rendered_input text not null check (char_length(rendered_input) <= 64000),
  output text check (output is null or char_length(output) <= 200000),
  error text check (error is null or char_length(error) <= 2000),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  passed boolean,
  grade smallint check (grade is null or grade between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_eval_results_case_unique unique (run_id, case_id),
  constraint developer_eval_results_has_outcome check (output is not null or error is not null)
);

drop trigger if exists set_developer_eval_results_updated_at on public.developer_eval_results;
create trigger set_developer_eval_results_updated_at
  before update on public.developer_eval_results
  for each row execute function public.set_row_updated_at();

revoke all on public.developer_prompts from public, app_rls;
grant select, insert, update, delete on public.developer_prompts to app_rls;
alter table public.developer_prompts enable row level security;
alter table public.developer_prompts force row level security;
drop policy if exists developer_prompts_owner on public.developer_prompts;
create policy developer_prompts_owner
  on public.developer_prompts for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

revoke all on public.developer_prompt_versions from public, app_rls;
grant select, insert on public.developer_prompt_versions to app_rls;
alter table public.developer_prompt_versions enable row level security;
alter table public.developer_prompt_versions force row level security;
drop policy if exists developer_prompt_versions_owner on public.developer_prompt_versions;
create policy developer_prompt_versions_owner
  on public.developer_prompt_versions for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and exists (
      select 1 from public.developer_prompts prompt
       where prompt.id = developer_prompt_versions.prompt_id
         and prompt.user_id = (select public.current_app_user_id())
    )
  );

revoke all on public.developer_eval_cases from public, app_rls;
grant select, insert, update, delete on public.developer_eval_cases to app_rls;
alter table public.developer_eval_cases enable row level security;
alter table public.developer_eval_cases force row level security;
drop policy if exists developer_eval_cases_owner on public.developer_eval_cases;
create policy developer_eval_cases_owner
  on public.developer_eval_cases for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and exists (
      select 1 from public.developer_prompts prompt
       where prompt.id = developer_eval_cases.prompt_id
         and prompt.user_id = (select public.current_app_user_id())
    )
  );

revoke all on public.developer_eval_runs from public, app_rls;
grant select, insert, delete on public.developer_eval_runs to app_rls;
alter table public.developer_eval_runs enable row level security;
alter table public.developer_eval_runs force row level security;
drop policy if exists developer_eval_runs_owner on public.developer_eval_runs;
create policy developer_eval_runs_owner
  on public.developer_eval_runs for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and exists (
      select 1 from public.developer_prompts prompt
       where prompt.id = developer_eval_runs.prompt_id
         and prompt.user_id = (select public.current_app_user_id())
    )
  );

revoke all on public.developer_eval_results from public, app_rls;
grant select, insert, update on public.developer_eval_results to app_rls;
alter table public.developer_eval_results enable row level security;
alter table public.developer_eval_results force row level security;
drop policy if exists developer_eval_results_owner on public.developer_eval_results;
create policy developer_eval_results_owner
  on public.developer_eval_results for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (
    user_id = (select public.current_app_user_id())
    and exists (
      select 1 from public.developer_eval_runs run
       where run.id = developer_eval_results.run_id
         and run.user_id = (select public.current_app_user_id())
    )
  );

comment on table public.developer_prompts is
  'Named prompts a developer keeps in the console.';
comment on table public.developer_prompt_versions is
  'Append-only versions of a prompt: system prompt, {{variable}} template, model and parameters.';
comment on table public.developer_eval_cases is
  'Test cases for a prompt: variable values and an optional expected output.';
comment on table public.developer_eval_runs is
  'One evaluation of a prompt version over its cases.';
comment on table public.developer_eval_results is
  'Per-case output, latency, tokens, automatic check and optional grade for an evaluation run.';

commit;
