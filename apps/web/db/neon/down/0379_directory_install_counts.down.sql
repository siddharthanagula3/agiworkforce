-- Reversal of 0379 removes the skill install totals and the connector
-- connection counts. The directory stops showing install counts and popularity
-- ranks. The totals are not lost for good: applying 0379 again rebuilds them
-- from user_settings, user_connectors and connector_oauth_grants.

begin;

drop trigger if exists user_settings_skill_install_counts on public.user_settings;
drop function if exists public.directory_connector_connection_counts();
drop function if exists public.skill_install_totals(text[]);
drop function if exists public.sync_skill_install_counts();
drop function if exists public.installed_skill_names(jsonb);
drop function if exists public.directory_count_minimum();
alter table if exists public.skill_install_counts disable row level security;
alter table if exists public.skill_install_counts no force row level security;
drop table if exists public.skill_install_counts;

delete from public.schema_migrations where filename = '0379_directory_install_counts.sql';

commit;
