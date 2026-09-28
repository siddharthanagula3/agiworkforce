-- Reversal of 0312 : content notices stop recording which claim was made.
--
-- WHAT THIS COSTS: every notice keeps its reporter, target, description and
-- disposition, but trademark and impersonation notices can no longer be told
-- apart from copyright notices.

begin;

alter table public.copyright_notices
  drop constraint if exists copyright_notices_notice_type_check;

alter table public.copyright_notices
  drop column if exists notice_type;

delete from public.schema_migrations
 where filename = '0312_content_notice_type.sql';

commit;
