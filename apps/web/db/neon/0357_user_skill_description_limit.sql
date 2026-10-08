-- =============================================================================
-- Migration 0357: a personal skill description may be 1,024 characters
--
-- Why    : the Agent Skills specification, which Claude follows, allows a
--          description of up to 1,024 characters. user_skills held it to 1,000,
--          so a skill written for Claude could not be uploaded here unchanged.
--
-- Shape  : replaces the description length check only. Every row that passed
--          the old check passes the new one.
--
-- Depends: 0157 (user_skills)
-- =============================================================================

begin;

alter table public.user_skills
  drop constraint if exists user_skills_description_check;

alter table public.user_skills
  add constraint user_skills_description_check
  check (char_length(description) between 1 and 1024);

commit;
