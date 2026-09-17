-- Reversal of 0216, drop the upload content digest.
--
-- The digest is the only thing that lets the upload path recognise a repeat,
-- so dropping it makes every subsequent upload store its own copy again.
-- Assets already deduplicated keep pointing at the object they share; nothing
-- is deleted and no stored bytes are lost.

begin;

drop index if exists public.idx_media_assets_content_sha256;

alter table public.media_assets
  drop column if exists content_sha256;

delete from public.schema_migrations
 where filename = '0216_media_assets_content_hash.sql';

commit;
