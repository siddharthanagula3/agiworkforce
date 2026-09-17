-- Reversal of 0203 : drop memory expiry and superseded history.
--
-- WHAT THIS COSTS: expiry dates and the superseded chain are deleted. Rows that
-- were superseded become active again beside the fact that replaced them, and
-- rows that had not yet been swept no longer expire.

begin;

drop index if exists public.idx_user_memories_expiry_due;

alter table public.user_memories
  drop constraint if exists user_memories_superseded_pair;

alter table public.user_memories
  drop column if exists superseded_at,
  drop column if exists superseded_by,
  drop column if exists expires_at;

delete from public.schema_migrations where filename = '0203_user_memories_lifecycle.sql';

commit;
