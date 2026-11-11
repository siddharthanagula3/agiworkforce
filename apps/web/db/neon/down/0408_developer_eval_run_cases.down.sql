-- Reversal of 0408: forget the frozen cases and expectations of evaluation runs.
--
-- WHAT THIS COSTS: the developer console reads and writes both objects, so the
-- code that admits runs against a frozen case set must be rolled back first or
-- starting and recording a run fails. The frozen case sets and the expected
-- output stored on each result are deleted and cannot be recovered. Results
-- keep their output and pass or fail verdict, but a reopened run can no longer
-- show what the verdict was measured against, and a result is graded against
-- the current case again, so a later edit to a case changes what it is checked
-- against.

begin;

drop table if exists public.developer_eval_run_cases;

alter table public.developer_eval_results
  drop column if exists expected_output;

delete from public.schema_migrations
 where filename = '0408_developer_eval_run_cases.sql';

commit;
