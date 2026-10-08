-- Reversal of 0355 : the cleared memory text does not come back.
--
-- WHAT THIS COSTS: a build or device that deletes a memory without clearing
-- its text leaves that text stored on the deleted row again.
-- 0355 cleared the content, category and import key of every deleted memory
-- and made the database clear them on each later delete. The text is gone, no
-- reversal can bring it back, and none should: the user deleted it.

begin;

drop trigger if exists purge_deleted_memory_text on public.user_memories;
drop function if exists public.purge_deleted_memory_text();

delete from public.schema_migrations
 where filename = '0355_user_memories_purge_deleted_text.sql';

commit;
