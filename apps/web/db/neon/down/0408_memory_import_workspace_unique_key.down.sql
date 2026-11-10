-- Reversal of 0408: dedupe a memory import per account again, across workspaces.
--
-- WHAT THIS COSTS: a fact imported into one workspace again makes the identical
-- fact imported into another workspace of the same account a skipped duplicate,
-- so that workspace silently never receives it.
--
-- THIS REVERSAL CAN FAIL, and failing is the correct outcome. The old index
-- allows one row per (user_id, source, import_key). If the same account has
-- imported the same fact into two workspaces since 0408 applied, the index is
-- refused and the whole transaction rolls back. Resolve those duplicates
-- deliberately before retrying; do not drop rows to make it apply.
--
-- ROLLBACK ORDER matters. Application code built on 0408 names the workspace
-- expression as its conflict target, which no longer matches any index after
-- this runs, so every memory import fails until that code is rolled back too.
-- Roll the deployment back first, then run this.

begin;

create unique index if not exists ux_user_memories_user_import_key
  on public.user_memories (user_id, source, import_key)
  where import_key is not null;

drop index if exists public.ux_user_memories_user_org_import_key;

delete from public.schema_migrations
 where filename = '0408_memory_import_workspace_unique_key.sql';

commit;
