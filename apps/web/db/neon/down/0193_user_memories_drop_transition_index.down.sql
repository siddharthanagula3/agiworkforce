-- Reversal of 0193 : put the transitional global unique index on user_memories.id back.
--
-- THIS REVERSAL CAN FAIL, and failing is the correct outcome: per-user identity
-- allows two accounts to hold the same id, and a global unique index cannot be
-- built over that. Resolve the duplicates deliberately before retrying; do not
-- drop rows to make it apply.

begin;

create unique index if not exists ux_user_memories_id_transition
  on public.user_memories (id);

delete from public.schema_migrations
  where filename = '0193_user_memories_drop_transition_index.sql';

commit;
