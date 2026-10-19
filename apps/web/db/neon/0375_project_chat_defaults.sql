-- =============================================================================
-- Migration 0375: tools a project's new chats start with
--
-- Why    : Claude loads a project's plugins and skills into every new thread,
--          and ChatGPT shows a project's connected tools on its page. A person
--          who always wants Run code, Research or one Skill in a project's
--          chats should set that once on the project.
--
-- Shape  : user_projects.chat_defaults holds a small JSON object, for example
--          {"codeExecution": true, "skillName": "brand-voice"}. An empty object
--          means the composer's own defaults. The API validates the keys; the
--          check here only bounds the type and size.
-- =============================================================================

begin;

set local lock_timeout = '5s';

alter table public.user_projects
  add column if not exists chat_defaults jsonb not null default '{}'::jsonb;

alter table public.user_projects
  drop constraint if exists user_projects_chat_defaults_shape;

alter table public.user_projects
  add constraint user_projects_chat_defaults_shape
  check (jsonb_typeof(chat_defaults) = 'object' and pg_column_size(chat_defaults) <= 1024);

comment on column public.user_projects.chat_defaults is
  'Composer tools a new chat in this project starts with (codeExecution, research, skillName). Empty object = composer defaults.';

commit;
