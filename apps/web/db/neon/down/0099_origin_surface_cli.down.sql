-- Reverses 0099_origin_surface_cli.sql — narrow cloud_agent_runs back to the
-- 0061 origin surfaces, without `cli`.
--
-- NOT VALID is deliberate. Re-adding the constraint validated would scan the
-- table and abort the whole rollback the moment one run was started from the
-- CLI while 0099 was applied — turning "undo the last deploy" into "the
-- database refuses to move". NOT VALID restores the guarantee for every new
-- row, which is what the rolled-back code depends on, and leaves the handful
-- of historical `cli` rows readable.
--
-- Once those rows are gone (or reclassified), finish the job with:
--   alter table public.cloud_agent_runs
--     validate constraint cloud_agent_runs_origin_surface_check;

begin;

alter table public.cloud_agent_runs
  drop constraint if exists cloud_agent_runs_origin_surface_check,
  add constraint cloud_agent_runs_origin_surface_check
  check (origin_surface = any (array[
    'web'::text,
    'desktop'::text,
    'mobile'::text,
    'chrome'::text,
    'vscode'::text,
    'api'::text
  ])) not valid;

delete from public.schema_migrations where filename = '0099_origin_surface_cli.sql';

commit;
