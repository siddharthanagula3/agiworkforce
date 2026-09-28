-- Reversal of 0310 : projects stop choosing which account personalization
-- they use.
--
-- WHAT THIS COSTS: a project set to leave out the account profile,
-- instructions or response style starts receiving them again in every chat.
-- No instruction or preference is deleted.

begin;

alter table public.user_projects
  drop column if exists uses_account_style,
  drop column if exists uses_account_instructions;

delete from public.schema_migrations
 where filename = '0310_project_account_personalization.sql';

commit;
