-- Reversal of 0373 deletes every saved template and brand kit. They cannot be
-- recovered from anywhere else; documents and decks made from them keep their
-- content.

begin;

drop policy if exists studio_library_items_user_isolation on public.studio_library_items;
alter table if exists public.studio_library_items disable row level security;
alter table if exists public.studio_library_items no force row level security;
drop index if exists public.idx_studio_library_items_user_kind;
drop table if exists public.studio_library_items;

delete from public.schema_migrations where filename = '0373_studio_library_items.sql';

commit;
