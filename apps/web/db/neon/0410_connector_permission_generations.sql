-- =============================================================================
-- Migration 0410: a remembered connector approval is bound to the permissions
-- the person reviewed
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : An approval card offered "allow for this conversation" or "always"
--          under the permissions loaded when the turn started. If the person
--          then reset the tool to Ask, or disconnected the connector, an
--          approval of that older card could still insert its conversation
--          grant or standing allow after the reset's DELETE had run, and the
--          grant turned the newer Ask back into Allow. Locking only the INSERT
--          or the DELETE cannot tell which permissions the card was built from.
--
-- Shape  : connector_permission_generations holds one counter per account and
--          connector. Every mutation of that connector's saved permissions (a
--          per-tool or category verdict, a reset, a disconnect, the account
--          on/off switch) takes the row's lock and adds one, in the same
--          transaction as the mutation. The turn reads the counters before it
--          reads the permissions its cards are built from, and each pending
--          call stores the value it was offered under in the approval
--          checkpoint. Saving a remembered approval locks the same rows in
--          connector order, refuses the whole batch when any counter moved, and
--          only then writes. The row is separate from the permission rows, so a
--          reset that deletes them cannot reset the counter.
--          Owner-only row-level security through app_rls, as
--          connector_account_states.
--
-- Empty  : no rows. A connector with no row is at generation 0, which is what
--          a turn records for it; the first mutation inserts the row at 1.
--          Approval checkpoints written before this release carry no
--          generation and can only be approved once.
--
-- Depends: 0037 (current_app_user_id, app_rls), 0076 (set_row_updated_at),
--          0364 (connector_tool_session_grants)
-- =============================================================================

begin;

create table if not exists public.connector_permission_generations (
  user_id text not null references public.profiles(id) on delete cascade,
  connector_id text not null check (char_length(connector_id) between 1 and 200),
  generation bigint not null default 0 check (generation >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, connector_id)
);

comment on table public.connector_permission_generations is
  'One counter per account and connector, advanced by every change to that connector''s saved tool permissions. A remembered approval is saved only while the counter still equals the value its approval card was offered under.';

drop trigger if exists set_connector_permission_generations_updated_at
  on public.connector_permission_generations;
create trigger set_connector_permission_generations_updated_at
  before update on public.connector_permission_generations
  for each row execute function public.set_row_updated_at();

alter table public.connector_permission_generations enable row level security;
alter table public.connector_permission_generations force row level security;

revoke all on public.connector_permission_generations from public;
grant select, insert, update on public.connector_permission_generations to app_rls;

drop policy if exists connector_permission_generations_owner
  on public.connector_permission_generations;
create policy connector_permission_generations_owner
  on public.connector_permission_generations
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

commit;
