-- Reversal of 0380 deletes every live artifact binding. The artifacts stay in
-- their chats; each owner has to allow its connected apps again to make it live.

begin;

drop policy if exists live_artifacts_user_isolation on public.live_artifacts;
drop trigger if exists set_live_artifacts_updated_at on public.live_artifacts;
alter table if exists public.live_artifacts disable row level security;
alter table if exists public.live_artifacts no force row level security;
drop index if exists public.idx_live_artifacts_message;
drop index if exists public.idx_live_artifacts_due;
drop index if exists public.idx_live_artifacts_user_recent;
drop table if exists public.live_artifacts;

delete from public.schema_migrations where filename = '0380_live_artifacts.sql';

commit;
