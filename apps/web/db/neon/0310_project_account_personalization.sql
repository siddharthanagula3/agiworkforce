-- =============================================================================
-- Migration 0310: a project chooses which account personalization it uses
--
-- Why    : account instructions, the profile (name, work, about you) and the
--          response style applied to every project chat with no way to keep
--          them out, so a project for a client or a different voice inherited
--          the user's personal preamble. A project could already opt out of
--          account memory (0135); these are the matching switches for the
--          rest of the personal layer.
--
-- Shape  : two booleans on user_projects, both default true so every existing
--          project keeps today's behaviour. uses_account_instructions covers
--          the profile and the account instructions; uses_account_style covers
--          the response style preferences.
--
-- Depends: 0006 (user_projects)
-- =============================================================================

begin;

alter table public.user_projects
  add column if not exists uses_account_instructions boolean not null default true,
  add column if not exists uses_account_style boolean not null default true;

comment on column public.user_projects.uses_account_instructions is
  'False = chats in this project do not receive the account profile or account instructions.';
comment on column public.user_projects.uses_account_style is
  'False = chats in this project do not receive the account response style preferences.';

commit;
