-- =============================================================================
-- Migration 0408: a memory import is unique per workspace, not per account
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : The import dedupe key from 0189 was (user_id, source, import_key). A
--          memory row also belongs to a workspace (organization_id, filled from
--          the active workspace on insert), so a fact imported into workspace A
--          made the identical fact imported into workspace B a duplicate: the
--          insert was skipped without a word and workspace B never received it.
--
-- Shape  : The unique index gains the workspace. A personal row has no
--          organization, and a plain column would let two personal rows with the
--          same key coexist because nulls never compare equal, so the index
--          keys on coalesce(organization_id, all-zero uuid). Personal rows
--          still collide with each other exactly as before. The import insert
--          names the same four-part expression as its conflict target.
--
-- Empty  : every existing row stays valid. The new key is strictly wider than
--          the old one, so no existing pair of rows can violate it and the
--          build cannot fail on existing data.
--
-- destructive: drops the account-wide import index, which the wider workspace
--          index replaces. No row is touched. The release before this one names
--          the old key as its conflict target, so apply this with the release
--          that names the workspace key; an import that runs between the two
--          fails and is retried by the user.
--
-- Depends: 0073 (user_memories.organization_id), 0110 (workspace default),
--          0189 (import_key and its per-user index)
-- =============================================================================

begin;

create unique index if not exists ux_user_memories_user_org_import_key
  on public.user_memories (
    user_id,
    source,
    import_key,
    (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where import_key is not null;

drop index if exists public.ux_user_memories_user_import_key;

commit;
