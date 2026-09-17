-- 0218 : a file attached to a temporary chat stops being a permanent file.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- A temporary chat promises the conversation is not kept, and the transcript
-- honoured that. Its attachments did not: `/api/uploads/chat-attachment/complete`
-- wrote every upload into media_assets, which is the table the Library lists,
-- so a document dropped into a temporary chat sat in the Library indefinitely
-- and outlived the chat that received it by the whole life of the account.
--
-- temporary_chat marks those rows. The Library filters them out, and the
-- temporary-chat purge marks them deleted at the same 30-day cutoff it uses for
-- the conversation, after which the existing deleted-media purge removes the
-- stored bytes. No second retention path and no second purge job.
--
-- Rows written before this migration default to false, which is what they
-- already were: kept files. The flag can only be set at upload time, by an
-- upload whose conversation the server has read as temporary, so it cannot be
-- turned on later to hide an ordinary file from the Library.
--
-- No new table, so no new RLS policy, grant, erasure entry or export entry:
-- media_assets is already user-owned and already classified.

begin;

alter table public.media_assets
  add column if not exists temporary_chat boolean not null default false;

create index if not exists idx_media_assets_temporary_chat
  on public.media_assets (created_at)
  where temporary_chat and deleted_at is null;

comment on column public.media_assets.temporary_chat is
  'The upload arrived in a temporary chat. The Library does not list it and the temporary-chat purge marks it deleted at the conversation retention cutoff.';

commit;
