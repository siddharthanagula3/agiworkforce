-- Reversal of 0357 : a personal skill description goes back to 1,000 characters.
--
-- WHAT THIS COSTS: a description longer than 1,000 characters is cut to its
-- first 1,000, because the restored check would otherwise refuse the row.

begin;

update public.user_skills
   set description = left(description, 1000)
 where char_length(description) > 1000;

alter table public.user_skills
  drop constraint if exists user_skills_description_check;

alter table public.user_skills
  add constraint user_skills_description_check
  check (char_length(description) between 1 and 1000);

delete from public.schema_migrations
 where filename = '0357_user_skill_description_limit.sql';

commit;
