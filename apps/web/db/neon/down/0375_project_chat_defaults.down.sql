-- Reversal of 0375 : projects lose the tools their new chats start with.
--
-- WHAT THIS COSTS: every project's chosen starting tools and Skill are
-- deleted, and new chats in those projects open with the composer defaults.

begin;

alter table public.user_projects
  drop constraint if exists user_projects_chat_defaults_shape;

alter table public.user_projects drop column if exists chat_defaults;

delete from public.schema_migrations
 where filename = '0375_project_chat_defaults.sql';

commit;
