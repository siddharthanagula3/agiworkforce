-- =============================================================================
-- Migration 0373: saved templates and brand kits
--
-- Why    : a document or deck could not be kept to start new ones from, and
--          there was nowhere to keep a brand's colours, fonts and voice to
--          apply to decks and documents.
--
-- Shape  : studio_library_items holds one saved item per row: a document
--          template, a deck template or a brand. payload carries the
--          template's title and content, or the brand's colours, fonts and
--          voice, as the API validates them. Rows belong to the account that
--          saved them and RLS keeps every other account out.
--
-- Depends: 0037_rls_user_isolation (current_app_user_id, app_rls role)
-- =============================================================================

begin;

create table if not exists public.studio_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('document_template', 'deck_template', 'brand')),
  name text not null check (char_length(name) between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_studio_library_items_user_kind
  on public.studio_library_items(user_id, kind, created_at desc);

alter table public.studio_library_items enable row level security;
alter table public.studio_library_items force row level security;
drop policy if exists studio_library_items_user_isolation on public.studio_library_items;
create policy studio_library_items_user_isolation
  on public.studio_library_items for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

commit;
