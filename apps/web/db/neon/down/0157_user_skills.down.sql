-- Reversal of 0157 — drop the user-authored skills table.

BEGIN;

drop table if exists public.user_skills;

delete from public.schema_migrations
 where filename = '0157_user_skills.sql';

COMMIT;
