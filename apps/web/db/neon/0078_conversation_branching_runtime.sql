-- Make the previously schema-only conversation_branches table safe for the
-- reachable Web branching runtime.

alter table public.conversation_branches
  add column if not exists request_id uuid;

-- Existing rows predate an idempotency key. Their primary key is already a
-- UUID, so it is a stable one-time backfill with no data loss.
update public.conversation_branches
   set request_id = id
 where request_id is null;

alter table public.conversation_branches
  alter column request_id set not null;

create unique index if not exists idx_conversation_branches_user_request
  on public.conversation_branches (user_id, request_id);
create index if not exists idx_conversation_branches_source_point
  on public.conversation_branches (source_conversation_id, branch_point_message_id, created_at);
create index if not exists idx_conversation_branches_target
  on public.conversation_branches (target_conversation_id);

-- Every copied message receives a new global id. Keep the source/target mapping
-- relational instead of inflating or trusting the message metadata bag.
create table if not exists public.conversation_branch_messages (
  branch_id uuid not null
    references public.conversation_branches(id) on delete cascade,
  source_message_id uuid not null
    references public.web_messages(id) on delete cascade,
  target_message_id uuid not null
    references public.web_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (branch_id, source_message_id),
  unique (branch_id, target_message_id)
);

create index if not exists idx_conversation_branch_messages_source
  on public.conversation_branch_messages (source_message_id);
create index if not exists idx_conversation_branch_messages_target
  on public.conversation_branch_messages (target_message_id);

grant select, insert, delete on
  public.conversation_branches,
  public.conversation_branch_messages
to app_rls;

alter table public.conversation_branches enable row level security;
alter table public.conversation_branches force row level security;

drop policy if exists conversation_branches_owner_read on public.conversation_branches;
create policy conversation_branches_owner_read
  on public.conversation_branches for select to app_rls
  using (user_id = public.current_app_user_id());

drop policy if exists conversation_branches_owner_insert on public.conversation_branches;
create policy conversation_branches_owner_insert
  on public.conversation_branches for insert to app_rls
  with check (
    user_id = public.current_app_user_id()
    and exists (
      select 1
        from public.web_conversations as source
       where source.id = source_conversation_id
         and source.user_id = public.current_app_user_id()
         and source.deleted_at is null
    )
    and exists (
      select 1
        from public.web_conversations as target
       where target.id = target_conversation_id
         and target.user_id = public.current_app_user_id()
         and target.deleted_at is null
    )
  );

drop policy if exists conversation_branches_owner_delete on public.conversation_branches;
create policy conversation_branches_owner_delete
  on public.conversation_branches for delete to app_rls
  using (user_id = public.current_app_user_id());

alter table public.conversation_branch_messages enable row level security;
alter table public.conversation_branch_messages force row level security;

drop policy if exists conversation_branch_messages_owner_read
  on public.conversation_branch_messages;
create policy conversation_branch_messages_owner_read
  on public.conversation_branch_messages for select to app_rls
  using (
    exists (
      select 1
        from public.conversation_branches as branch
       where branch.id = branch_id
         and branch.user_id = public.current_app_user_id()
    )
  );

drop policy if exists conversation_branch_messages_owner_insert
  on public.conversation_branch_messages;
create policy conversation_branch_messages_owner_insert
  on public.conversation_branch_messages for insert to app_rls
  with check (
    exists (
      select 1
        from public.conversation_branches as branch
        join public.web_messages as source_message
          on source_message.id = source_message_id
        join public.web_conversations as source_conversation
          on source_conversation.id = source_message.conversation_id
        join public.web_messages as target_message
          on target_message.id = target_message_id
        join public.web_conversations as target_conversation
          on target_conversation.id = target_message.conversation_id
       where branch.id = branch_id
         and branch.user_id = public.current_app_user_id()
         and source_conversation.id = branch.source_conversation_id
         and source_conversation.user_id = public.current_app_user_id()
         and target_conversation.id = branch.target_conversation_id
         and target_conversation.user_id = public.current_app_user_id()
    )
  );

drop policy if exists conversation_branch_messages_owner_delete
  on public.conversation_branch_messages;
create policy conversation_branch_messages_owner_delete
  on public.conversation_branch_messages for delete to app_rls
  using (
    exists (
      select 1
        from public.conversation_branches as branch
       where branch.id = branch_id
         and branch.user_id = public.current_app_user_id()
    )
  );
