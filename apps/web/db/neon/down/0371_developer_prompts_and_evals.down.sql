begin;

drop table if exists public.developer_eval_results;
drop table if exists public.developer_eval_runs;
drop table if exists public.developer_eval_cases;
drop table if exists public.developer_prompt_versions;
drop table if exists public.developer_prompts;
delete from public.schema_migrations
 where filename = '0371_developer_prompts_and_evals.sql';

commit;
