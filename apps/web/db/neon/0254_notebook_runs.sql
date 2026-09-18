-- =============================================================================
-- Migration 0254: notebook run provenance
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : a notebook cell ran, produced a number, and left nothing behind but
--          the output in the browser. Who ran it, when, against which code and
--          under which network policy was answerable only while the tab stayed
--          open, which is not enough for a result anyone is asked to trust.
--
-- Shape  : one row per executed cell. `run_id` groups the cells of one run-all
--          so a whole-notebook execution is a single thing in the history, and
--          `cell_index` keeps their order. `from_top` records that the run
--          covered the notebook from its first cell, which is the only kind of
--          run whose result does not depend on a cell someone ran by hand.
--
-- Code   : stored, capped at the same 50k the executor accepts, because the
--          provenance question is "what code produced this", which a digest
--          alone cannot answer. `code_sha256` is there so two runs of the same
--          cell are comparable without reading both.
--
-- Markdown cells never reach here: they are not executed, so they have no run.
--
-- Depends: 0037 (current_app_user_id), 0075 (cloud_code_sessions)
-- =============================================================================

begin;

create table if not exists public.notebook_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  organization_id uuid,
  session_id uuid not null references public.cloud_code_sessions(id) on delete cascade,
  run_id uuid not null,
  cell_id text not null check (char_length(btrim(cell_id)) between 1 and 200),
  cell_index integer not null check (cell_index >= 0),
  language text not null check (char_length(language) between 1 and 40),
  code text not null check (char_length(code) between 1 and 50000),
  code_sha256 text not null check (code_sha256 ~ '^[0-9a-f]{64}$'),
  network_access text not null check (network_access in ('none', 'trusted', 'full')),
  from_top boolean not null default false,
  ok boolean not null,
  error text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  constraint notebook_runs_ends_after_it_starts check (finished_at >= started_at)
);

create index if not exists idx_notebook_runs_session_started
  on public.notebook_runs (session_id, started_at desc);

create index if not exists idx_notebook_runs_run
  on public.notebook_runs (run_id, cell_index);

grant select, insert, update, delete on public.notebook_runs to app_rls;

alter table public.notebook_runs enable row level security;
alter table public.notebook_runs force row level security;

drop policy if exists notebook_runs_owner on public.notebook_runs;
create policy notebook_runs_owner
  on public.notebook_runs for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.notebook_runs is
  'One row per executed notebook cell: who ran it, when, what code, under which network policy, and whether the run covered the notebook from its first cell.';
comment on column public.notebook_runs.run_id is
  'Groups the cells of one run-all. A single-cell run is a run of one.';
comment on column public.notebook_runs.from_top is
  'The run covered the notebook from its first cell in order, so its result does not depend on a cell someone ran by hand.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Closing the session takes its run history with it:
-- --    DELETE FROM public.cloud_code_sessions WHERE id = '<session>';
-- --    SELECT count(*) FROM public.notebook_runs WHERE session_id = '<session>';
-- --    EXPECT: 0
--
-- -- 2. An unknown network policy is refused:
-- --    INSERT ... network_access = 'partial'  -- EXPECT: check violation.
--
-- -- 3. A run that finished before it started is refused:
-- --    INSERT ... started_at = now(), finished_at = now() - interval '1 minute'
-- --    EXPECT: check violation.
--
-- -- 4. Another user cannot read the run history:
-- --    SET ROLE app_rls; SELECT set_config('app.user_id', 'user_2', true);
-- --    SELECT count(*) FROM public.notebook_runs;  -- EXPECT: 0
