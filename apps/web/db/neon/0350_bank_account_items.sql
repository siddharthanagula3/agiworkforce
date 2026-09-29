-- =============================================================================
-- Migration 0350: every bank a person links, each removable on its own
--
-- Why    : bank linking kept one Plaid item per account and replaced it on the
--          next link, so a second bank dropped the first and there was no way
--          to remove one bank or hide one of its accounts.
--
-- Shape  : one row per linked Plaid item, its access token sealed with the
--          plaid-access-token purpose, the institution's name, and the account
--          ids the person chose to leave out of chats and the finance view.
--          The connector grant stays the "Bank accounts is connected" marker.
--          plaid_item_id is null only for an earlier single link whose token
--          Plaid did not accept when it was carried over, kept so it can be
--          removed.
--
-- Erasure: the profile foreign key cascades; account erasure removes each item
--          at Plaid first and names the table.
-- =============================================================================

begin;

create table if not exists public.bank_account_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  plaid_item_id text check (plaid_item_id is null or char_length(plaid_item_id) between 1 and 128),
  access_token_enc text not null,
  institution_name text check (institution_name is null or char_length(institution_name) <= 200),
  excluded_account_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_account_items_item_unique unique (user_id, plaid_item_id)
);

grant select, insert, update, delete on public.bank_account_items to app_rls;

alter table public.bank_account_items enable row level security;
alter table public.bank_account_items force row level security;

drop policy if exists bank_account_items_user_isolation on public.bank_account_items;
create policy bank_account_items_user_isolation
  on public.bank_account_items
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.bank_account_items is
  'One row per Plaid item a person linked: sealed access token, institution and the account ids left out of chats. app_rls sees only the signed-in account''s own rows.';

commit;
