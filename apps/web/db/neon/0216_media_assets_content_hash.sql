-- 0216 : record what an uploaded file actually contains, so it is stored once.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Every completed upload wrote a new object and a new row, so the same file
-- attached to three conversations was three copies in object storage and three
-- times the bytes on the storage bill. The upload path already hashes the
-- scanned bytes for the moderation denylist; nothing kept the digest, so
-- nothing could tell that the fourth copy was a copy.
--
-- content_sha256 is that digest. The index is deliberately not unique: an
-- upload that arrives before this migration has no digest, and a partial
-- unique index would fail to build on a deployment that already holds
-- duplicates. Uniqueness is the upload path's job, which looks the digest up
-- inside the uploader's own scope before it stores anything.
--
-- No new table, so no new RLS policy, grant, erasure entry or export entry:
-- media_assets is already user-owned and already classified.

begin;

alter table public.media_assets
  add column if not exists content_sha256 text
    check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');

create index if not exists idx_media_assets_content_sha256
  on public.media_assets (user_id, content_sha256)
  where content_sha256 is not null and deleted_at is null;

comment on column public.media_assets.content_sha256 is
  'SHA-256 of the stored bytes. The upload path reuses the existing asset when the uploader already holds this digest, so identical content is stored and billed once.';

commit;
