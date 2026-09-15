-- Reversal of 0189 : put memory row identity back on a single global primary key.
--
-- WHAT THIS COSTS: after this runs, one account can again occupy a memory id
-- that belongs to another, so a crafted sync push silently drops a targeted
-- user's write and reports whether the id already existed. It also drops the
-- per-user import dedupe key, so the first import a user runs after the
-- reversal re-inserts every memory it already imported.
--
-- THIS REVERSAL CAN FAIL, and failing is the correct outcome. Restoring the
-- global primary key requires every id in the table to be unique across all
-- accounts. If two accounts hold the same id, which per-user uniqueness allows,
-- the constraint is refused and the whole transaction rolls back. Resolve the
-- duplicates deliberately before retrying; do not drop rows to make it apply.
--
-- ROLLBACK ORDER matters. Application code that predates this reversal names
-- `import_key` on the import insert and infers `(user_id, id)` as the sync
-- conflict target, so both memory writes fail until that code is rolled back
-- too. Roll the deployment back first, then run this.

begin;

alter table public.user_memories
  drop constraint if exists user_memories_pkey;

alter table public.user_memories
  add constraint user_memories_pkey primary key (id);

drop index if exists public.ux_user_memories_user_import_key;

drop index if exists public.ux_user_memories_id_transition;

alter table public.user_memories
  drop column if exists import_key;

delete from public.schema_migrations
  where filename = '0189_user_memories_per_user_identity.sql';

commit;
