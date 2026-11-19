-- Reversal of 0422: the chat file intake and preparation tables, the scan
-- verdict column and the insert trigger on media_assets go.
--
-- WHAT THIS COSTS: an intake row is the only pointer to its staging object,
-- and a preparation row the only list of its derived objects; storage cannot be
-- listed, so dropping either table while it holds a row leaves bytes nobody can
-- find or delete. A sealed large file's media row would also lose the verdict
-- its seal recorded, and the trigger that keeps unscanned large chat files out
-- of media_assets would be gone. The reversal therefore refuses while any
-- intake or preparation row exists or any media row carries scanned_sha256:
-- erase or purge those first. Run before any large file was uploaded, it costs
-- nothing.

begin;

do $$
begin
  if exists (select 1 from public.chat_file_intakes)
     or exists (select 1 from public.chat_file_preparations)
     or exists (select 1 from public.media_assets where scanned_sha256 is not null) then
    raise exception 'Chat file intakes, preparations or scanned media rows still exist; purge them before reversing 0422'
      using errcode = '55000';
  end if;
end
$$;

drop trigger if exists media_assets_refuse_unscanned_large_chat_file on public.media_assets;
drop function if exists public.refuse_unscanned_large_chat_file();
alter table public.media_assets drop column if exists scanned_sha256;

drop policy if exists chat_file_preparations_tenant_isolation on public.chat_file_preparations;
drop trigger if exists chat_file_preparations_set_updated_at on public.chat_file_preparations;
drop index if exists public.chat_file_preparations_orphan_idx;
drop index if exists public.chat_file_preparations_organization_idx;
drop index if exists public.chat_file_preparations_user_idx;
drop table if exists public.chat_file_preparations;

drop policy if exists chat_file_intakes_tenant_isolation on public.chat_file_intakes;
drop trigger if exists chat_file_intakes_set_updated_at on public.chat_file_intakes;
drop index if exists public.chat_file_intakes_state_changed_idx;
drop index if exists public.chat_file_intakes_organization_idx;
drop index if exists public.chat_file_intakes_user_state_idx;
drop table if exists public.chat_file_intakes;

delete from public.schema_migrations
 where filename = '0422_chat_file_intakes.sql';

commit;
