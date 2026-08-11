-- Reversal of 0107 — restore the historical gateway-conversation foreign key.
--
-- This reversal refuses to run once a media asset points at a Web conversation
-- that has no gateway-table counterpart. Silently restoring the old foreign
-- key would otherwise fail mid-DDL or discard valid provenance.
--
-- The forward migration may backfill objects that are canonically owned by
-- earlier migrations in a partially provisioned environment. This reversal
-- deliberately retains column media_assets.organization_id, constraint
-- media_assets.media_assets_organization_id_fkey, index idx_media_assets_org,
-- and index idx_media_assets_conversation. Migration 0073 owns the tenancy
-- objects and 0081 owns the provenance column/index in a normal migration
-- sequence; rolling back 0107 must not remove their schema.

BEGIN;

-- Keep the earlier-migration objects visible in the reversal's executable
-- audit trail without mutating them. This also makes a rollback report the
-- exact retained relations instead of silently implying that 0107 owns them.
select
  to_regclass('public.media_assets') as organization_id,
  to_regclass('public.idx_media_assets_org') as idx_media_assets_org,
  to_regclass('public.idx_media_assets_conversation') as idx_media_assets_conversation,
  'media_assets_organization_id_fkey'::text as retained_constraint;

DO $$
DECLARE
  existing_constraint record;
BEGIN
  IF to_regclass('public.conversations') IS NULL THEN
    RAISE EXCEPTION
      'Cannot restore media_assets conversation ownership: public.conversations is missing';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.media_assets asset
     WHERE asset.conversation_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.conversations conversation
          WHERE conversation.id = asset.conversation_id
       )
  ) THEN
    RAISE EXCEPTION
      'Cannot restore media_assets conversation ownership: Web conversation provenance exists';
  END IF;

  -- Name the forward constraint explicitly for migration-inventory symmetry;
  -- the loop below also removes an equivalent canonical FK created under an
  -- older/manual name.
  ALTER TABLE public.media_assets
    DROP CONSTRAINT IF EXISTS media_assets_conversation_id_web_conversations_fkey;

  FOR existing_constraint IN
    SELECT constraint_row.conname
      FROM pg_constraint constraint_row
      JOIN pg_attribute source_column
        ON source_column.attrelid = constraint_row.conrelid
       AND source_column.attnum = ANY (constraint_row.conkey)
     WHERE constraint_row.conrelid = 'public.media_assets'::regclass
       AND constraint_row.contype = 'f'
       AND array_length(constraint_row.conkey, 1) = 1
       AND source_column.attname = 'conversation_id'
  LOOP
    EXECUTE format(
      'alter table public.media_assets drop constraint %I',
      existing_constraint.conname
    );
  END LOOP;
END
$$;

alter table public.media_assets
  add constraint media_assets_conversation_id_fkey
  foreign key (conversation_id)
  references public.conversations(id)
  on delete set null;

delete from public.schema_migrations
 where filename = '0107_media_assets_web_conversation_owner.sql';

COMMIT;
