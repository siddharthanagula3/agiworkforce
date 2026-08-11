-- 0107: Point generated-media provenance at the Web conversation owner.
--
-- Migration 0081 attached media_assets.conversation_id to the gateway
-- compatibility table public.conversations. The Web chat runtime creates IDs
-- in public.web_conversations, so generated media could not persist its real
-- conversation provenance. Keep 0081 immutable for migration-checksum history
-- and replace its foreign key forward here.
--
-- Some early production environments were provisioned manually from 0036 and
-- therefore never received the nullable tenancy/provenance columns from 0073
-- and 0081. Backfill only that additive schema contract here before inspecting
-- constraints. A normal sequential migration run treats both statements as
-- no-ops, while a partially provisioned environment becomes safe to repair.

alter table public.media_assets
  add column if not exists organization_id uuid,
  add column if not exists conversation_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint constraint_row
      JOIN pg_attribute source_column
        ON source_column.attrelid = constraint_row.conrelid
       AND source_column.attnum = ANY (constraint_row.conkey)
     WHERE constraint_row.conrelid = 'public.media_assets'::regclass
       AND constraint_row.contype = 'f'
       AND array_length(constraint_row.conkey, 1) = 1
       AND source_column.attname = 'organization_id'
       AND constraint_row.confrelid = 'public.organizations'::regclass
       AND constraint_row.confdeltype = 'c'
  ) THEN
    alter table public.media_assets
      add constraint media_assets_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete cascade;
  END IF;
END
$$;

DO $$
DECLARE
  canonical_constraint_name text;
  existing_constraint record;
BEGIN
  IF to_regclass('public.media_assets') IS NULL THEN
    RAISE EXCEPTION 'Cannot repair media provenance: public.media_assets is missing';
  END IF;

  IF to_regclass('public.web_conversations') IS NULL THEN
    RAISE EXCEPTION 'Cannot repair media provenance: public.web_conversations is missing';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.media_assets asset
     WHERE asset.conversation_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.web_conversations conversation
          WHERE conversation.id = asset.conversation_id
       )
  ) THEN
    RAISE EXCEPTION
      'Cannot repair media provenance: conversation_id contains non-Web conversation values';
  END IF;

  -- Preserve one already-canonical constraint regardless of its historical
  -- name. Some environments repaired the target manually before this forward
  -- migration existed. Re-adding a second equivalent FK would make admission
  -- fail closed and double the constraint work on every write.
  SELECT constraint_row.conname
    INTO canonical_constraint_name
    FROM pg_constraint constraint_row
    JOIN pg_attribute source_column
      ON source_column.attrelid = constraint_row.conrelid
     AND source_column.attnum = ANY (constraint_row.conkey)
    JOIN pg_attribute target_column
      ON target_column.attrelid = constraint_row.confrelid
     AND target_column.attnum = ANY (constraint_row.confkey)
   WHERE constraint_row.conrelid = 'public.media_assets'::regclass
     AND constraint_row.contype = 'f'
     AND array_length(constraint_row.conkey, 1) = 1
     AND array_length(constraint_row.confkey, 1) = 1
     AND source_column.attname = 'conversation_id'
     AND constraint_row.confrelid = 'public.web_conversations'::regclass
     AND target_column.attname = 'id'
     AND constraint_row.confdeltype = 'n'
     AND constraint_row.convalidated
   ORDER BY
     (constraint_row.conname = 'media_assets_conversation_id_web_conversations_fkey') DESC,
     constraint_row.conname
   LIMIT 1;

  -- Drop only competing single-column ownership FKs. Composite constraints
  -- that happen to include conversation_id belong to a different contract and
  -- are deliberately untouched.
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
       AND constraint_row.conname IS DISTINCT FROM canonical_constraint_name
  LOOP
    EXECUTE format(
      'alter table public.media_assets drop constraint %I',
      existing_constraint.conname
    );
  END LOOP;

  IF canonical_constraint_name IS NULL THEN
    alter table public.media_assets
      add constraint media_assets_conversation_id_web_conversations_fkey
      foreign key (conversation_id)
      references public.web_conversations(id)
      on delete set null;
  END IF;
END
$$;

create index if not exists idx_media_assets_org
  on public.media_assets(organization_id)
  where organization_id is not null;

create index if not exists idx_media_assets_conversation
  on public.media_assets(conversation_id, created_at desc)
  where conversation_id is not null and deleted_at is null;

comment on column public.media_assets.conversation_id is
  'Web conversation that generated this asset. NULL for uploads, historical '
  'assets, and after source conversation deletion.';
